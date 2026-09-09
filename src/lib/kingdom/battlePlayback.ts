import { advanceBattle, Battle, battleSpeed, replayBattle } from './game';

/** Fixed-step playback. Frame timing chooses how many steps, never their size. */
export class BattlePlayback {
    battle: Battle;
    private remainder = 0;

    constructor(readonly outcome: Battle, elapsed = 0) {
        const initial = replayBattle(outcome);
        this.battle = advanceBattle(initial, Math.floor(Math.max(0, Math.min(elapsed, outcome.elapsed)) / initial.config.stepSeconds));
    }

    advance(milliseconds: number) {
        if (this.battle.result) return false;
        this.remainder += Math.max(0, milliseconds);
        const stepMs = this.battle.config.stepSeconds * 1000 / battleSpeed(this.battle.config.rulesVersion);
        const steps = Math.floor((this.remainder + 1e-7) / stepMs);
        if (!steps) return false;
        this.remainder = Math.max(0, this.remainder - steps * stepMs);
        this.battle = advanceBattle(this.battle, steps);
        // An older frontend must still finish at the persisted endpoint if its
        // simulation diverges. Only the trusted outcome is ever shown as a result.
        if (this.battle.result || this.battle.elapsed >= this.outcome.elapsed) this.finish();
        return true;
    }

    finish() { this.battle = this.outcome; }
}
