import { Battle } from './game';
import { ATTACK_SECONDS, motionX, projectilePosition, spriteFrame, STALE_BATTLE_SECONDS, VisualUnit, visualUnits } from './battleAnimation';

const HEIGHT = 256;
const SIZE = 84;
const MAX_PROJECTILES = 96;
const ASSETS = {
  'warrior-blue': '/assets/tiny-swords/warrior-blue.png',
  'warrior-red': '/assets/tiny-swords/warrior-red.png',
  'archer-blue': '/assets/tiny-swords/archer-blue.png',
  'archer-red': '/assets/tiny-swords/archer-red.png',
  'catapult-blue': '/assets/battle/catapult-blue.svg',
  'catapult-red': '/assets/battle/catapult-red.svg',
  'horse-blue': '/assets/battle/horse-blue.svg',
  'horse-red': '/assets/battle/horse-red.svg',
  arrow: '/assets/battle/arrow.svg', stone: '/assets/battle/stone.svg',
};
type AssetName = keyof typeof ASSETS;
type Artwork = Partial<Record<AssetName, CanvasImageSource>>;
let artwork: Promise<Artwork> | undefined;

function loadArtwork() {
  // Decode and scale once, shared across battles. Failed assets retry next mount.
  return artwork ??= Promise.all(Object.entries(ASSETS).map(([key, source]) => new Promise<[AssetName, CanvasImageSource | undefined]>(resolve => {
    const image = new Image();
    image.onload = () => {
      const sheet = document.createElement('canvas');
      const columns = key.startsWith('warrior') ? 6 : 8;
      const rows = key.startsWith('warrior') ? 8 : key.startsWith('archer') ? 7 : 1;
      const isSheet = /warrior|archer|catapult/.test(key);
      sheet.width = isSheet ? columns * SIZE : image.width;
      sheet.height = isSheet ? rows * SIZE : image.height;
      const context = sheet.getContext('2d');
      if (context) { context.imageSmoothingEnabled = false; context.drawImage(image, 0, 0, sheet.width, sheet.height); }
      resolve([key as AssetName, context ? sheet : image]);
    };
    image.onerror = () => { artwork = undefined; resolve([key as AssetName, undefined]); };
    image.src = source;
  }))).then(entries => Object.fromEntries(entries) as Artwork);
}

interface Projectile {
  kind: 'arrow' | 'stone'; start: number; duration: number;
  fromX: number; fromY: number; toX: number; toY: number;
}

/** One bounded canvas loop, independent of React and the combat/save clock. */
export class BattleRenderer {
  private images: Artwork = {};
  private units: VisualUnit[] = [];
  private projectiles: Projectile[] = [];
  private releases = new Map<number, number>();
  private battle?: Battle;
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
      if (!this.disposed) { this.images = images; this.wake(); }
    });
  }

  update(battle: Battle, running: boolean) {
    const now = performance.now();
    if (battle !== this.battle) {
      const reset = !this.battle || battle.elapsed < this.battle.elapsed || battle.stage !== this.battle.stage
        || (!!this.battle.result && !battle.result);
      if (reset) { this.units = []; this.projectiles = []; this.releases.clear(); this.clock = 0; }
      // Duplicate snapshots (e.g. a wallet refresh) must not rewind movement or
      // keep stale combat alive. Only an advancing simulation resets its age.
      if (reset || battle.elapsed > this.battle!.elapsed || battle.result !== this.battle!.result) {
        this.units = visualUnits(battle, this.units, (now - this.receivedAt) / 1000);
        this.receivedAt = now;
      }
      this.battle = battle;
      this.units.sort((a, b) => this.lane(a.fighter.id) - this.lane(b.fighter.id) || a.fighter.id - b.fighter.id);
      const activeIds = new Set(this.units.filter(unit => unit.pose === 'attack').map(unit => unit.fighter.id));
      for (const id of this.releases.keys()) if (!activeIds.has(id)) this.releases.delete(id);
    }
    this.running = running && !battle.result;
    if (battle.result) this.projectiles = [];
    this.wake();
  }

  private lane(id: number) { return 168 + (id % 3) * 16; }
  private screenX(x: number) { return this.width * (0.1 + x * 0.008); }
  private animate(now: number) {
    return this.running && this.visible && !document.hidden && !this.reducedMotion.matches
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
    if (this.disposed) return;
    if (!this.animate(performance.now())) {
      cancelAnimationFrame(this.frame); this.frame = 0; this.lastFrame = 0;
      if (this.visible && !document.hidden) this.draw(performance.now(), false);
    } else if (!this.frame) {
      this.lastFrame = 0; this.frame = requestAnimationFrame(this.render);
    }
  };

  private render = (now: number) => {
    this.frame = 0;
    if (this.disposed) return;
    const animating = this.animate(now);
    const delta = this.lastFrame ? now - this.lastFrame : 0;
    if (!this.lastFrame || delta >= 1000 / 60 - 0.5 || !animating) {
      this.clock += Math.min(delta, 50) / 1000;
      this.lastFrame = now;
      this.draw(now, animating);
    }
    if (animating) this.frame = requestAnimationFrame(this.render);
  };

  private draw(now: number, animating: boolean) {
    const ctx = this.context;
    const scale = Math.max(0.6, Math.min(1, this.width / 640));
    ctx.clearRect(0, 0, this.width, HEIGHT);
    const age = (now - this.receivedAt) / 1000;
    const unitX = (unit: VisualUnit) => !this.running || this.reducedMotion.matches ? unit.to : motionX(unit, age);
    for (const unit of this.units) {
      const { fighter, pose } = unit;
      const x = this.screenX(unitX(unit));
      const y = this.lane(fighter.id);
      const direction = pose === 'attack' ? (unit.targetX >= fighter.x ? 1 : -1) : fighter.side === 'player' ? 1 : -1;
      const team = fighter.side === 'player' ? 'blue' : 'red';
      const time = this.clock + fighter.id % 11 * 0.09;
      const period = ATTACK_SECONDS[fighter.kind];
      const phase = (time % period) / period;
      const siege = fighter.kind === 'workshop';
      const mounted = fighter.kind === 'stable';
      const key: AssetName = `${siege ? 'catapult' : fighter.kind === 'range' ? 'archer' : 'warrior'}-${team}`;
      const asset = this.images[key];
      const frame = spriteFrame(fighter.kind, pose, time, this.reducedMotion.matches);
      ctx.save(); ctx.translate(x, y); ctx.scale(direction * scale, scale);
      if (mounted && this.images[`horse-${team}`]) ctx.drawImage(this.images[`horse-${team}`]!, -32, -45, 64, 64);
      if (asset) {
        const column = siege ? (pose === 'attack' && !this.reducedMotion.matches ? Math.floor(phase * 8) : 0) : frame.column;
        ctx.drawImage(asset, column * SIZE, (siege ? 0 : frame.row) * SIZE, SIZE, SIZE, -42, mounted ? -72 : -58, SIZE, SIZE);
      } else {
        ctx.fillStyle = fighter.side === 'player' ? '#38bdf8' : '#fb7185';
        ctx.fillRect(-8, -20, 16, 24);
      }
      ctx.restore();
      ctx.fillStyle = '#182b38'; ctx.fillRect(x - 13 * scale, y - (mounted ? 44 : 35) * scale, 26 * scale, 3);
      ctx.fillStyle = fighter.side === 'player' ? '#7dd3fc' : '#fda4af';
      ctx.fillRect(x - 13 * scale, y - (mounted ? 44 : 35) * scale, 26 * scale * Math.max(0, fighter.hp / fighter.maxHp), 3);

      if (pose === 'attack' && (fighter.kind === 'range' || siege)) {
        const cycle = Math.floor(time / period - (siege ? 0.5 : 0.75));
        const previous = this.releases.get(fighter.id);
        this.releases.set(fighter.id, cycle);
        if (animating && previous !== undefined && cycle > previous && this.projectiles.length < MAX_PROJECTILES) {
          const target = unit.targetId === undefined ? undefined : this.units.find(candidate => candidate.fighter.id === unit.targetId);
          this.projectiles.push({ kind: siege ? 'stone' : 'arrow', start: this.clock, duration: siege ? 0.95 : 0.5,
            fromX: unitX(unit) + direction * (siege ? 22 : 12) * scale / (this.width * 0.008),
            fromY: y - (siege ? 34 : 12) * scale,
            toX: target ? unitX(target) : unit.targetX,
            toY: target ? this.lane(target.fighter.id) - 10 * scale : 156 });
        }
      }
    }
    if (this.reducedMotion.matches) this.projectiles = [];
    this.projectiles = this.projectiles.filter(p => this.clock - p.start < p.duration + 0.16);
    for (const projectile of this.projectiles) {
      const t = (this.clock - projectile.start) / projectile.duration;
      const point = projectilePosition(this.screenX(projectile.fromX), projectile.fromY,
        this.screenX(projectile.toX), projectile.toY, t, projectile.kind === 'stone' ? 65 : 17);
      ctx.save(); ctx.translate(point.x, point.y);
      if (t >= 1) {
        ctx.globalAlpha = Math.max(0, 1 - (t - 1) * projectile.duration / 0.16);
        ctx.strokeStyle = projectile.kind === 'stone' ? '#d9d2ae' : '#fff3c4'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 3 + (t - 1) * 25, 0, Math.PI * 2); ctx.stroke();
      } else if (this.images[projectile.kind]) {
        ctx.rotate(projectile.kind === 'arrow' ? point.angle : t * 5);
        const width = (projectile.kind === 'arrow' ? 26 : 14) * scale;
        const height = (projectile.kind === 'arrow' ? 8 : 14) * scale;
        ctx.drawImage(this.images[projectile.kind]!, -width / 2, -height / 2, width, height);
      }
      ctx.restore();
    }
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect(); this.intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.wake);
    this.reducedMotion.removeEventListener('change', this.wake);
    this.projectiles = [];
  }
}
