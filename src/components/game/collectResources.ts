import { KNOWLEDGE_RESOURCES } from '../../game/economy';

// Fly a small handful of resource seals into their actual balance in the HUD.
export async function collectResources(source: HTMLElement, topic: string) {
  const resource = KNOWLEDGE_RESOURCES.find(item => item.topic === topic);
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-resource-topic]'))
    .find(element => element.dataset.resourceTopic === topic);
  if (!resource || !target || !source.animate) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  target.scrollIntoView?.({ behavior: 'instant', block: 'nearest' });
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const x = Math.max(24, Math.min(window.innerWidth - 24, from.left + from.width / 2));
  const y = Math.max(60, Math.min(window.innerHeight - 24, from.top + from.height / 2));
  const dx = to.left + to.width / 2 - x;
  const dy = to.top + to.height / 2 - y;
  const particles = Array.from({ length: 7 }, (_, index) => {
    const seal = document.createElement('span');
    seal.className = 'collect-resource-particle';
    seal.textContent = resource.symbol;
    seal.setAttribute('aria-hidden', 'true');
    Object.assign(seal.style, { left: `${x}px`, top: `${y}px`, color: resource.color });
    document.body.appendChild(seal);
    const spread = (index - 3) * 17;
    const animation = seal.animate([
      { transform: 'translate(-50%, -50%) scale(.45)', opacity: 0 },
      { transform: `translate(calc(-50% + ${spread}px), calc(-50% - 42px)) scale(1.15)`, opacity: 1, offset: .24 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.35)`, opacity: 0 },
    ], { duration: 620, delay: index * 28, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
    return animation.finished.catch(() => {}).finally(() => seal.remove());
  });
  await Promise.all(particles);
  target.animate([
    { transform: 'scale(1)', boxShadow: '0 0 0px #fbbf24' },
    { transform: 'scale(1.16)', boxShadow: '0 0 24px #fbbf24', offset: .35 },
    { transform: 'scale(1)', boxShadow: '0 0 0px #fbbf24' },
  ], { duration: 320, easing: 'ease-out' });
}
