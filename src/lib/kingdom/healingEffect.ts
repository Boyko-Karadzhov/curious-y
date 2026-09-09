/** Presentation only: the simulation owns healing targets and HP. */
export function drawHealingAura(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, time: number, still: boolean, sprite?: CanvasImageSource) {
    const pulse = still ? 1 : 1 + Math.sin(time * 4) * .08;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (sprite) {
        ctx.globalAlpha = still ? .85 : .85 + Math.sin(time * 4) * .1;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(sprite, -40 * pulse, -62 * pulse, 80 * pulse, 80 * pulse);
        ctx.restore();
        return;
    }
    // A small canvas rune remains available while the sprite loads or fails.
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#34d399';
    ctx.globalAlpha = .16;
    ctx.beginPath(); ctx.ellipse(0, -2, 28 * pulse, 10 * pulse, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = .8;
    ctx.strokeStyle = '#a7f3d0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, -2, 25 * pulse, 8 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, -2, 18 * pulse, 5 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
    // Six orbiting rune points give the ground ring a readable magical silhouette.
    for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + (still ? 0 : time * .65);
        const px = Math.cos(angle) * 25 * pulse, py = -2 + Math.sin(angle) * 8 * pulse;
        ctx.fillStyle = i % 2 ? '#fef3c7' : '#d1fae5';
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    ctx.restore();
}

export function drawHealingMotes(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, scale: number, time: number, still: boolean) {
    ctx.save();
    ctx.shadowColor = '#6ee7b7'; ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ecfdf5'; ctx.lineWidth = 1.5 * scale;
    const sparkle = (x: number, y: number, size: number) => {
        ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
        ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke();
    };
    // Reduced motion keeps only a steady recipient marker; no traveling particles.
    if (!still) {
        for (let i = 0; i < 7; i++) {
            const t = (time * .8 + i / 7) % 1;
            const x = fromX + (toX - fromX) * t;
            const y = fromY + (toY - fromY) * t - Math.sin(t * Math.PI) * 24 * scale;
            ctx.globalAlpha = Math.sin(t * Math.PI) * .9;
            sparkle(x, y, (i % 3 === 0 ? 2.8 : 1.6) * scale);
        }
    }
    for (let i = 0; i < 3; i++) {
        const t = still ? .45 + i * .15 : (time * .6 + i / 3) % 1;
        ctx.globalAlpha = still ? .8 : Math.sin(t * Math.PI);
        const x = toX + (i - 1) * 14 * scale + (still ? 0 : Math.sin(t * Math.PI * 2 + i) * 4 * scale);
        const y = toY + 12 * scale - t * 44 * scale;
        sparkle(x, y, 3 * scale);
    }
    ctx.restore();
}
