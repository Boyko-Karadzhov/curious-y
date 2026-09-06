import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Battlefield } from '../components/game/Battlefield';
import { createBattle, newKingdom } from '../lib/kingdom/game';

function mount() {
  return render(<><button>Outside</button><Battlefield battle={createBattle(newKingdom())} running={false}><button>Battle action</button></Battlefield></>);
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(document, 'fullscreenElement'); Reflect.deleteProperty(document, 'exitFullscreen'); });

describe('Expanded battle', () => {
  it('works without fullscreen, preserves the canvas, and restores focus and scrolling on Escape', async () => {
    mount();
    const canvas = document.querySelector('canvas');
    const expand = screen.getByRole('button', { name: 'Expand battle' });
    expand.focus();
    fireEvent.click(expand);
    expect(screen.getByRole('dialog', { name: 'Expanded battle' })).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByText('Outside').inert).toBe(true);
    expect(document.querySelector('canvas')).toBe(canvas);
    const close = screen.getByRole('button', { name: 'Exit expanded view' });
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Battle action' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Expanded battle' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByText('Outside').inert).toBeFalsy();
    expect(expand).toHaveFocus();
    await act(async () => {});
  });

  it('requests landscape after fullscreen and unlocks when the browser exits fullscreen', async () => {
    const view = mount();
    const element = view.container.querySelector('.battle-view')!;
    let fullscreen: Element | null = null;
    Object.defineProperty(element, 'requestFullscreen', { value: vi.fn(async () => { fullscreen = element; }) });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
    const lock = vi.fn(async () => {}), unlock = vi.fn();
    vi.stubGlobal('screen', { orientation: { lock, unlock } });
    fireEvent.click(screen.getByRole('button', { name: 'Expand battle' }));
    await waitFor(() => expect(lock).toHaveBeenCalledWith('landscape'));
    await act(async () => {});
    fullscreen = null;
    fireEvent(document, new Event('fullscreenchange'));
    expect(unlock).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Expand battle' })).toBeInTheDocument();
  });

  it.each(['fullscreen', 'orientation'])('keeps the overlay usable when %s is denied', async denied => {
    const view = mount();
    const element = view.container.querySelector('.battle-view')!;
    Object.defineProperty(element, 'requestFullscreen', { value: vi.fn(async () => { if (denied === 'fullscreen') throw new Error('Denied'); }) });
    const lock = vi.fn(async () => { throw new Error('Unsupported'); });
    vi.stubGlobal('screen', { orientation: { lock } });
    fireEvent.click(screen.getByRole('button', { name: 'Expand battle' }));
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: 'Expanded battle' })).toBeInTheDocument();
    expect(screen.getByText('Turn your phone for a wider view')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exit expanded view' }));
    expect(document.body.style.overflow).toBe('');
  });

  it('cleans up a pending fullscreen request after unmount without locking orientation', async () => {
    const view = mount();
    const element = view.container.querySelector('.battle-view')!;
    let resolve!: () => void;
    let fullscreen: Element | null = null;
    Object.defineProperty(element, 'requestFullscreen', { value: () => new Promise<void>(done => { resolve = () => { fullscreen = element; done(); }; }) });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
    const exitFullscreen = vi.fn(async () => { fullscreen = null; });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
    const lock = vi.fn();
    vi.stubGlobal('screen', { orientation: { lock } });
    fireEvent.click(screen.getByRole('button', { name: 'Expand battle' }));
    view.unmount();
    await act(async () => resolve());
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(lock).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
    delete (document as Partial<Document>).exitFullscreen;
  });
});

