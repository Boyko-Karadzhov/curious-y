import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { InstallAppModal } from '../components/common/InstallAppModal';

describe('PWA Manifest and Installation Support', () => {
  it('has a valid manifest.webmanifest with all required PWA fields and icons', () => {
    const manifestPath = path.resolve(__dirname, '../../public/manifest.webmanifest');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    expect(manifest.name).toBe('Curious-Y | LLM Microlearning');
    expect(manifest.short_name).toBe('Curious-Y');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#f8fafc');
    expect(manifest.theme_color).toBe('#0e8ceb');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);

    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');

    const maskable = manifest.icons.find((i: { purpose?: string }) => i.purpose === 'maskable');
    expect(maskable).toBeDefined();
  });

  it('has generated icon assets present in public directory', () => {
    const publicDir = path.resolve(__dirname, '../../public');
    const requiredAssets = [
      'favicon.svg',
      'pwa-192x192.png',
      'pwa-512x512.png',
      'pwa-maskable-192x192.png',
      'pwa-maskable-512x512.png',
      'apple-touch-icon.png',
      'sw.js',
      'manifest.webmanifest',
      'manifest.json',
    ];

    for (const asset of requiredAssets) {
      expect(fs.existsSync(path.join(publicDir, asset))).toBe(true);
    }
  });

  it('renders InstallAppModal correctly when native install prompt is available', () => {
    const onNativeInstall = vi.fn();
    const onClose = vi.fn();

    render(
      <InstallAppModal
        isOpen={true}
        onClose={onClose}
        onNativeInstall={onNativeInstall}
        canNativeInstall={true}
      />
    );

    expect(screen.getByText(/Install Curious-Y/i)).toBeInTheDocument();
    expect(screen.getByText(/Install App Now/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Install App Now/i));
    expect(onNativeInstall).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders InstallAppModal instructions when native install is not available', () => {
    const onClose = vi.fn();

    render(
      <InstallAppModal
        isOpen={true}
        onClose={onClose}
        canNativeInstall={false}
      />
    );

    expect(screen.getByRole('heading', { name: /Install Curious-Y/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
