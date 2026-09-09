import { Battle, battleSpeed, ALL_UNIT_IDENTITIES } from './game';
import { unitArt, unitArtFrame } from './unitArt';
import { ATTACK_SECONDS, motionX, projectilePosition, STALE_BATTLE_SECONDS, Pose, VisualUnit, visualIntent, visualUnits } from './battleAnimation';
import { drawHealingAura, drawHealingMotes } from './healingEffect';
import { drawEquippedUnit, drawSiegeAmmunition, loadEquipmentArtwork, EQUIPMENT_COLORS } from './equipmentArt';

const HEIGHT = 256;
const MAX_PROJECTILES = 96;
const HIT_FLASH_MS = 160;
const DAMAGE_MS = 900;
const MAX_IMPACTS = 128;
const ASSETS = {
    ...Object.fromEntries(ALL_UNIT_IDENTITIES.map(u => [`unit-${u.id}`, unitArt(u.id).portrait])) as Record<`unit-${import('./game').UnitId}`, string>,
    ...Object.fromEntries(ALL_UNIT_IDENTITIES.map(u => [`atlas-${u.id}`, unitArt(u.id).atlas.src])) as Record<`atlas-${import('./game').UnitId}`, string>,
    arrow: '/assets/battle/arrow.svg', stone: '/assets/battle/stone.svg',
    healingAura: '/assets/battle/healing-aura-v1.png',
};
type AssetName = keyof typeof ASSETS;
type Artwork = Partial<Record<AssetName, CanvasImageSource>>;
let artwork: Promise<Artwork> | undefined;

function loadArtwork() {
    // Share decoded artwork across battles. Preserve the authored cell geometry.
    return artwork ??= Promise.all(Object.entries(ASSETS).map(([key, source]) => new Promise<[AssetName, CanvasImageSource | undefined]>(resolve => {
        const image = new Image();
        image.onload = () => resolve([key as AssetName, image]);
        image.onerror = () => {
            artwork = undefined; resolve([key as AssetName, undefined]); 
        };
        image.src = source;
    }))).then(entries => Object.fromEntries(entries) as Artwork);
}

interface Projectile {
  tier?: number;
  kind: 'arrow' | 'stone'; start: number; duration: number;
  fromX: number; fromY: number; toX: number; toY: number;
}

interface Impact {
  unit: VisualUnit; damage: number; start: number; x: number; fallen: boolean;
}

/** One bounded canvas loop, independent of React and the combat/save clock. */
export class BattleRenderer {
    private images: Artwork = {};
    private units: VisualUnit[] = [];
    private projectiles: Projectile[] = [];
    private impacts: Impact[] = [];
    private releases = new Map<number, number>();
    private poses = new Map<number, { pose: Pose; targetId?: number; startedAt: number }>();
    private battle?: Battle;
    private equipmentKey = '';
    private running = false;
    private visible = true;
    private disposed = false;
    private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    private resizeObserver?: ResizeObserver;
    private intersectionObserver?: IntersectionObserver;
    private frame = 0;
    private lastFrame = 0;
    private clock = 0;
    private receivedAt = 0;
    private width = 600;

    constructor(private canvas: HTMLCanvasElement, private context: CanvasRenderingContext2D) {
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(this.resize);
            this.resizeObserver.observe(canvas);
        }
        if (typeof IntersectionObserver !== 'undefined') {
            this.intersectionObserver = new IntersectionObserver(entries => {
                this.visible = entries[0].isIntersecting; this.wake();
            });
            this.intersectionObserver.observe(canvas);
        }
        document.addEventListener('visibilitychange', this.wake);
        this.reducedMotion.addEventListener('change', this.wake);
        this.resize();
        void loadArtwork().then(images => {
            if (!this.disposed) {
                this.images = images; this.wake(); 
            }
        });
    }

    update(battle: Battle, running: boolean) {
        const equipmentKey=JSON.stringify(battle.config.slots.map(u=>u&&[u.id,u.equipment]));
        if(equipmentKey!==this.equipmentKey){
            this.equipmentKey=equipmentKey;
            void loadEquipmentArtwork(battle.config.slots.flatMap(u=>u?[u]:[])).then(()=>{
                if(!this.disposed){
                    this.wake();
                }
            });
        }
        const now = performance.now();
        if (battle !== this.battle) {
            const reset = !this.battle || battle.id !== this.battle.id || battle.elapsed < this.battle.elapsed || battle.stage !== this.battle.stage
        || (!!this.battle.result && !battle.result);
            if (reset) {
                this.units = []; this.projectiles = []; this.impacts = []; this.releases.clear(); this.poses.clear(); this.clock = 0; 
            }
            // Duplicate snapshots (e.g. a wallet refresh) must not rewind movement or
            // keep stale combat alive. Only an advancing simulation resets its age.
            if (reset || battle.elapsed > this.battle!.elapsed || battle.result !== this.battle!.result) {
                // Health belongs to the simulation. Show only observed HP loss, including
                // a removed fighter's remaining health, never predicted attack damage.
                if (!reset && (running || this.running) && !this.reducedMotion.matches) {
                    const fighters = new Map(battle.fighters.map(fighter => [fighter.id, fighter]));
                    for (const unit of this.units) {
                        const next = fighters.get(unit.fighter.id);
                        const damage = unit.fighter.hp - Math.max(0, next?.hp ?? 0);
                        if (damage > 0) {
                            this.impacts.push({ unit, damage, start: now,
                                x: motionX(unit, (now - this.receivedAt) / 1000), fallen: !next });
                        }
                    }
                    this.impacts = this.impacts.filter(impact => now - impact.start < DAMAGE_MS).slice(-MAX_IMPACTS);
                }
                this.units = visualUnits(battle, this.units, (now - this.receivedAt) / 1000);
                this.receivedAt = now;
            }
            this.battle = battle;
            const livingIds = new Set(this.units.map(unit => unit.fighter.id));
            for (const id of this.poses.keys()) {
                if (!livingIds.has(id)) {
                    this.poses.delete(id);
                }
            }
            this.units.sort((a, b) => this.lane(a.fighter.id) - this.lane(b.fighter.id) || a.fighter.id - b.fighter.id);
            const activeIds = new Set(this.units.filter(unit => unit.pose === 'attack').map(unit => unit.fighter.id));
            for (const id of this.releases.keys()) {
                if (!activeIds.has(id)) {
                    this.releases.delete(id);
                }
            }
        }
        this.running = running && !battle.result;
        if (battle.result || !running) {
            this.projectiles = [];
        }
        if (!battle.result && !running) {
            this.impacts = [];
        }
        this.wake();
    }

    private lane(id: number) {
        return 168 + (id % 3) * 16; 
    }
    private screenX(x: number) {
        return this.width * (0.1 + x * 0.008); 
    }
    private animate(now: number) {
        return (this.running || this.impacts.some(impact => now - impact.start < DAMAGE_MS))
      && this.visible && !document.hidden && !this.reducedMotion.matches
      && now - this.receivedAt < STALE_BATTLE_SECONDS * 1000;
    }

    private resize = () => {
        this.width = Math.max(1, this.canvas.getBoundingClientRect().width || 600);
        // Bound fill work on high-density phones; pixel art needs no 3x/4x buffer.
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        this.canvas.width = Math.round(this.width * ratio);
        this.canvas.height = Math.round(HEIGHT * ratio);
        this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.context.imageSmoothingEnabled = false;
        this.wake();
    };

    private wake = () => {
        if (this.disposed) {
            return;
        }
        if (!this.animate(performance.now())) {
            cancelAnimationFrame(this.frame); this.frame = 0; this.lastFrame = 0;
            if (this.visible && !document.hidden) {
                this.draw(performance.now(), false);
            }
        } else if (!this.frame) {
            this.lastFrame = 0; this.frame = requestAnimationFrame(this.render);
        }
    };

    private render = (now: number) => {
        this.frame = 0;
        if (this.disposed) {
            return;
        }
        const animating = this.animate(now);
        const delta = this.lastFrame ? now - this.lastFrame : 0;
        if (!this.lastFrame || delta >= 1000 / 60 - 0.5 || !animating) {
            this.clock += Math.min(delta, 50) / 1000 * battleSpeed(this.battle!.config.rulesVersion);
            this.lastFrame = now;
            this.draw(now, animating);
        }
        if (animating) {
            this.frame = requestAnimationFrame(this.render);
        }
    };

    private draw(now: number, animating: boolean) {
        const ctx = this.context;
        const scale = Math.max(0.6, Math.min(1, this.width / 640));
        ctx.clearRect(0, 0, this.width, HEIGHT);
        const age = (now - this.receivedAt) / 1000;
        const unitX = (unit: VisualUnit) => !this.running || this.reducedMotion.matches ? unit.to : motionX(unit, age);
        this.impacts = this.reducedMotion.matches ? [] : this.impacts.filter(impact => now - impact.start < DAMAGE_MS);
        const flashing = new Set(this.impacts.filter(impact => now - impact.start < HIT_FLASH_MS).map(impact => impact.unit.fighter.id));
        const fallen = this.impacts.filter(impact => impact.fallen && flashing.has(impact.unit.fighter.id));
        const visibleUnits = [...this.units, ...fallen.map(impact => ({ ...impact.unit, from: impact.x, to: impact.x, velocity: 0 }))]
            .sort((a, b) => this.lane(a.fighter.id) - this.lane(b.fighter.id) || a.fighter.id - b.fighter.id);
        const healingLinks = this.running && !this.battle?.result && age < STALE_BATTLE_SECONDS
            ? this.units.flatMap(unit => {
                if (unit.fighter.ability?.family !== 'heal' && unit.fighter.kind !== 'medic') {
                    return [];
                }
                const intent = this.reducedMotion.matches ? unit : visualIntent(unit, age, this.units);
                const ally = intent.pose === 'attack' ? this.units.find(candidate => candidate.fighter.id === intent.targetId) : undefined;
                return ally ? [{ healer: unit, ally }] : [];
            }) : [];
        const effectTime = this.clock / battleSpeed(this.battle?.config.rulesVersion ?? 1);
        // Ground runes sit underneath sprites; shared recipients get one aura.
        for (const ally of new Set(healingLinks.map(link => link.ally))) {
            drawHealingAura(ctx, this.screenX(unitX(ally)), this.lane(ally.fighter.id), scale, effectTime, this.reducedMotion.matches, this.images.healingAura);
        }
        for (const unit of visibleUnits) {
            const { fighter } = unit;
            const { pose, targetId, targetX } = this.running && !this.reducedMotion.matches ? visualIntent(unit, age, this.units) : unit;
            const x = this.screenX(unitX(unit));
            const y = this.lane(fighter.id);
            const direction = pose === 'attack' ? (targetX >= unitX(unit) ? 1 : -1) : fighter.side === 'player' ? 1 : -1;
            const time = this.clock + fighter.id % 11 * 0.09;
            // Sprite poses use their authored cadence independently of fast combat,
            // so faster travel does not make feet flutter.
            const visualClock = this.clock / battleSpeed(this.battle!.config.rulesVersion);
            const previousPose = this.poses.get(fighter.id);
            const attackTarget = pose === 'attack' ? targetId : undefined;
            if (!previousPose || previousPose.pose !== pose || previousPose.targetId !== attackTarget) {
                this.poses.set(fighter.id, { pose, targetId: attackTarget, startedAt: visualClock });
            }
            // A fresh contact starts the swing now, never partway through a global
            // animation cycle. Later combat snapshots must not restart that swing.
            const spriteTime = pose === 'attack' ? visualClock - this.poses.get(fighter.id)!.startedAt : visualClock + fighter.id % 11 * 0.09;
            const period = fighter.attackInterval || ATTACK_SECONDS[fighter.kind];
            const siege = fighter.ability?.family === 'splash' || fighter.kind === 'catapult';
            const art = unitArt(fighter.kind);
            const displaySize = art.displayHeight * art.atlas.frameSize / art.idleHeight;
            ctx.save(); ctx.translate(x, y); ctx.scale(direction * scale, scale);
            // Filters affect only the sprite's opaque pixels, preserving its silhouette.
            ctx.filter = flashing.has(fighter.id) ? 'brightness(0) invert(1)' : fighter.side === 'enemy' ? 'brightness(0.65)' : 'none';
            const identity = ALL_UNIT_IDENTITIES.find(u => u.id === fighter.kind)!;
            const generatedSheet = this.images[`atlas-${fighter.kind}`];
            const cell = unitArtFrame(fighter.kind, pose, spriteTime, period, this.reducedMotion.matches);
            const equipped = fighter.side === 'player' && drawEquippedUnit(ctx,fighter.kind,fighter.equipment,cell.row*4+cell.column,art.displayHeight);
            if (!equipped && generatedSheet) {
                const { frameSize, anchorX, anchorY } = art.atlas;
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(generatedSheet, cell.column * frameSize, cell.row * frameSize, frameSize, frameSize,
                    -anchorX * displaySize, -anchorY * displaySize, displaySize, displaySize);
            } else if (!equipped && this.images[`unit-${fighter.kind}`]) {
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(this.images[`unit-${fighter.kind}`]!, -28, -64, 64, 64);
            } else if (!equipped) {
                // Loading failure must never substitute a different character identity.
                ctx.fillStyle = fighter.side === 'player' ? '#38bdf8' : '#fb7185';
                ctx.fillRect(-8, -20, 16, 24);
            }
            ctx.restore();
            if (fallen.some(impact => impact.unit.fighter.id === fighter.id)) {
                continue;
            }
            ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
            if (fighter.slowUntil && fighter.slowUntil > this.battle!.elapsed) {
                ctx.strokeStyle = '#a5f3fc'; ctx.strokeRect(x - 10, y - 22, 20, 24); 
            }
            if (fighter.rallyUntil && fighter.rallyUntil > this.battle!.elapsed) {
                ctx.fillStyle = '#c4b5fd'; ctx.fillText('+', x + 15, y - 20); 
            }
            if (fighter.kind === 'clockwork-gunner') {
                ctx.fillStyle = '#fde68a'; ctx.fillText(`${(fighter.attackCount ?? 0) % 5}/5`, x, y - 38 * scale); 
            }
            if (fighter.lastAttackAt && this.battle!.elapsed - fighter.lastAttackAt <= .25 && !this.reducedMotion.matches && fighter.ability?.family === 'splash') {
                ctx.beginPath(); ctx.arc(this.screenX(fighter.lastTargetX ?? unit.targetX), y - 10, (fighter.splashRadius ?? 4) * 2, 0, Math.PI * 2); ctx.strokeStyle = identity.color; ctx.stroke();
            }
            if (fighter.kind === 'clockwork-gunner' && fighter.attackCount && fighter.attackCount % 5 === 0 && this.battle!.elapsed - (fighter.lastAttackAt ?? 0) <= .25 && !this.reducedMotion.matches) {
                ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(this.screenX(Math.max(0, Math.min(100, (fighter.lastTargetX ?? fighter.x) + (fighter.side === 'player' ? 9 : -9)))), y - 18); ctx.strokeStyle = '#fde68a'; ctx.stroke();
            }
            const healthY = y - (art.displayHeight + 5) * scale;
            ctx.fillStyle = '#182b38'; ctx.fillRect(x - 13 * scale, healthY, 26 * scale, 3);
            ctx.fillStyle = fighter.side === 'player' ? '#7dd3fc' : '#fda4af';
            ctx.fillRect(x - 13 * scale, healthY, 26 * scale * Math.max(0, fighter.hp / fighter.maxHp), 3);
            // Tier pips keep reused silhouettes distinguishable without animation.
            if (this.battle!.config.rulesVersion >= 7 && 'tier' in identity) {
                ctx.fillStyle = identity.color;
                for (let pip = 0; pip < identity.tier; pip++) {
                    ctx.fillRect(x - 12 * scale + pip * 5 * scale, healthY - 4, 3 * scale, 2);
                }
            }

            if (pose === 'attack' && (identity.tags.includes('ranged') || siege)) {
                // Releases follow combat cadence; sprite poses have their own visual clock.
                const cycle = Math.floor(time / period - 0.5);
                const previous = this.releases.get(fighter.id);
                this.releases.set(fighter.id, cycle);
                if (animating && previous !== undefined && cycle > previous && this.projectiles.length < MAX_PROJECTILES) {
                    const target = targetId === undefined ? undefined : this.units.find(candidate => candidate.fighter.id === targetId);
                    // Keep flights readable in real seconds, even during accelerated combat.
                    this.projectiles.push({ kind: siege ? 'stone' : 'arrow', start: effectTime, duration: siege ? 0.95 : 0.5,
                        tier: siege ? fighter.equipment?.weapon : undefined,
                        fromX: unitX(unit) + direction * (siege ? 22 : 12) * scale / (this.width * 0.008),
                        fromY: y - art.displayHeight * (siege ? .82 : .52) * scale,
                        toX: target ? unitX(target) : targetX,
                        toY: target ? this.lane(target.fighter.id) - 10 * scale : 156 });
                }
            }
        }
        for (const { healer, ally } of healingLinks) {
            drawHealingMotes(ctx, this.screenX(unitX(healer)), this.lane(healer.fighter.id) - 20 * scale,
                this.screenX(unitX(ally)), this.lane(ally.fighter.id) - 18 * scale, scale,
                effectTime + healer.fighter.id * .13, this.reducedMotion.matches);
        }
        if (this.reducedMotion.matches) {
            this.projectiles = [];
        }
        this.projectiles = this.projectiles.filter(p => effectTime - p.start < p.duration + 0.16);
        for (const projectile of this.projectiles) {
            const t = (effectTime - projectile.start) / projectile.duration;
            const point = projectilePosition(this.screenX(projectile.fromX), projectile.fromY,
                this.screenX(projectile.toX), projectile.toY, t, projectile.kind === 'stone' ? 65 : 17);
            ctx.save(); ctx.translate(point.x, point.y);
            if (t >= 1) {
                ctx.globalAlpha = Math.max(0, 1 - (t - 1) * projectile.duration / 0.16);
                ctx.strokeStyle = projectile.tier ? EQUIPMENT_COLORS[projectile.tier-1] : projectile.kind === 'stone' ? '#d9d2ae' : '#fff3c4'; ctx.lineWidth = projectile.tier ? 1+projectile.tier*.5 : 2;
                ctx.beginPath(); ctx.arc(0, 0, 3 + (t - 1) * 25, 0, Math.PI * 2); ctx.stroke();
            } else if (projectile.tier && projectile.kind === 'stone') {
                const tier=projectile.tier;
                // A tier-colored wake follows the actual projectile tangent.
                ctx.save();ctx.rotate(point.angle);ctx.strokeStyle=EQUIPMENT_COLORS[tier-1];ctx.lineWidth=2+tier*.6;ctx.globalAlpha=.45;
                ctx.beginPath();ctx.moveTo(-4*scale,0);ctx.lineTo(-(9+tier*5)*scale,0);ctx.stroke();ctx.restore();
                if(!drawSiegeAmmunition(ctx,tier,(15+tier*2)*scale,t*(3+tier)) && this.images.stone){
                    ctx.drawImage(this.images.stone,-7*scale,-7*scale,14*scale,14*scale);
                }
            } else if (this.images[projectile.kind]) {
                ctx.rotate(projectile.kind === 'arrow' ? point.angle : t * 5);
                const width = (projectile.kind === 'arrow' ? 26 : 14) * scale;
                const height = (projectile.kind === 'arrow' ? 8 : 14) * scale;
                ctx.drawImage(this.images[projectile.kind]!, -width / 2, -height / 2, width, height);
            }
            ctx.restore();
        }
        // Draw feedback last so neighboring sprites and projectiles cannot cover it.
        for (const impact of this.impacts) {
            const progress = (now - impact.start) / DAMAGE_MS;
            const y = this.lane(impact.unit.fighter.id) - (unitArt(impact.unit.fighter.kind).displayHeight + 14) * scale - progress * 34 * scale;
            ctx.save();
            ctx.globalAlpha = Math.min(1, (1 - progress) / .6);
            ctx.font = `bold ${Math.round(16 * scale)}px sans-serif`; ctx.textAlign = 'center';
            ctx.strokeStyle = '#450a0a'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
            ctx.fillStyle = '#ff4d4d';
            const label = `-${Math.max(1, Math.round(impact.damage))}`;
            ctx.strokeText(label, this.screenX(impact.x), y);
            ctx.fillText(label, this.screenX(impact.x), y);
            ctx.restore();
        }
    }

    dispose() {
        this.disposed = true; cancelAnimationFrame(this.frame);
        this.resizeObserver?.disconnect(); this.intersectionObserver?.disconnect();
        document.removeEventListener('visibilitychange', this.wake);
        this.reducedMotion.removeEventListener('change', this.wake);
        this.projectiles = [];
        this.impacts = [];
        this.poses.clear();
    }
}
