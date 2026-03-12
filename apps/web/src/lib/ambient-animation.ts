/**
 * Ambient Animation System
 *
 * Renders environment-specific ambient overlays on a canvas.
 * Each environment type (street, shopping, elevator, pedestrian) has
 * a lightweight procedural animation that conveys the context.
 *
 * Designed to composite on top of the DOOH creative as a semi-transparent
 * overlay, giving the viewer a sense of the real-world installation context.
 */

import type { EnvironmentType } from '@dooh/core';

export interface AmbientState {
  environmentType: EnvironmentType;
  enabled: boolean;
  intensity: number; // 0..1
}

export const DEFAULT_AMBIENT_STATE: AmbientState = {
  environmentType: 'street',
  enabled: true,
  intensity: 0.5,
};

/* ─── Particle system for ambient effects ───────────────── */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
}

function createParticle(w: number, h: number, type: EnvironmentType): Particle {
  switch (type) {
    case 'street': {
      // Horizontal-moving light streaks (headlights / passing cars)
      const fromLeft = Math.random() > 0.5;
      return {
        x: fromLeft ? -20 : w + 20,
        y: h * (0.6 + Math.random() * 0.35),
        vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 4),
        vy: (Math.random() - 0.5) * 0.2,
        size: 3 + Math.random() * 6,
        opacity: 0.15 + Math.random() * 0.2,
        life: 0,
        maxLife: 120 + Math.random() * 80,
      };
    }
    case 'shopping': {
      // Slow-drifting light spots (ambient mall lighting, reflections)
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: 20 + Math.random() * 40,
        opacity: 0.04 + Math.random() * 0.06,
        life: 0,
        maxLife: 200 + Math.random() * 200,
      };
    }
    case 'elevator': {
      // Vertical light band pass (LED strip reflections)
      return {
        x: Math.random() * w,
        y: -30,
        vx: 0,
        vy: 0.5 + Math.random() * 1.5,
        size: 2 + Math.random() * 3,
        opacity: 0.08 + Math.random() * 0.12,
        life: 0,
        maxLife: 150 + Math.random() * 100,
      };
    }
    case 'pedestrian': {
      // Shadows/silhouettes drifting across (pedestrian shadows)
      const fromLeft = Math.random() > 0.5;
      return {
        x: fromLeft ? -40 : w + 40,
        y: h * (0.5 + Math.random() * 0.4),
        vx: (fromLeft ? 1 : -1) * (0.5 + Math.random() * 1.5),
        vy: 0,
        size: 30 + Math.random() * 50,
        opacity: 0.06 + Math.random() * 0.08,
        life: 0,
        maxLife: 200 + Math.random() * 200,
      };
    }
  }
}

/* ─── Ambient renderer class ────────────────────────────── */

const MAX_PARTICLES = 15;

export class AmbientRenderer {
  private particles: Particle[] = [];
  private frameCount = 0;
  private envType: EnvironmentType = 'street';
  private intensity = 0.5;

  configure(state: AmbientState) {
    if (state.environmentType !== this.envType) {
      this.particles = [];
      this.frameCount = 0;
    }
    this.envType = state.environmentType;
    this.intensity = state.intensity;
  }

  /** Render one frame of ambient animation onto the given canvas context */
  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.intensity <= 0) return;

    this.frameCount++;

    // Spawn particles
    const spawnRate = this.getSpawnRate();
    if (this.particles.length < MAX_PARTICLES && this.frameCount % spawnRate === 0) {
      this.particles.push(createParticle(w, h, this.envType));
    }

    ctx.save();
    ctx.globalAlpha = this.intensity;

    // Update and draw particles
    this.particles = this.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life++;

      // Fade in/out
      const progress = p.life / p.maxLife;
      const fade = progress < 0.1
        ? progress / 0.1
        : progress > 0.8
          ? (1 - progress) / 0.2
          : 1;

      if (p.life >= p.maxLife) return false;
      if (p.x < -100 || p.x > w + 100 || p.y < -100 || p.y > h + 100) return false;

      this.drawParticle(ctx, p, fade);
      return true;
    });

    // Additional environment-specific overlay effects
    this.drawOverlay(ctx, w, h);

    ctx.restore();
  }

  private getSpawnRate(): number {
    switch (this.envType) {
      case 'street': return 8;
      case 'shopping': return 20;
      case 'elevator': return 12;
      case 'pedestrian': return 15;
    }
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle, fade: number) {
    const alpha = p.opacity * fade;

    switch (this.envType) {
      case 'street': {
        // Warm headlight streaks
        ctx.save();
        ctx.globalAlpha *= alpha;
        const grad = ctx.createLinearGradient(
          p.x - p.size * 4, p.y,
          p.x + p.size * 4, p.y,
        );
        grad.addColorStop(0, 'rgba(255,220,150,0)');
        grad.addColorStop(0.3, `rgba(255,220,150,${alpha})`);
        grad.addColorStop(0.7, `rgba(255,220,150,${alpha})`);
        grad.addColorStop(1, 'rgba(255,220,150,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - p.size * 4, p.y - p.size * 0.3, p.size * 8, p.size * 0.6);
        ctx.restore();
        break;
      }
      case 'shopping': {
        // Soft warm light orbs
        ctx.save();
        ctx.globalAlpha *= alpha;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, 'rgba(255,245,230,0.15)');
        grad.addColorStop(0.5, 'rgba(255,235,210,0.05)');
        grad.addColorStop(1, 'rgba(255,230,200,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        ctx.restore();
        break;
      }
      case 'elevator': {
        // Thin vertical light bands
        ctx.save();
        ctx.globalAlpha *= alpha;
        const grad = ctx.createLinearGradient(p.x, p.y - p.size * 6, p.x, p.y + p.size * 6);
        grad.addColorStop(0, 'rgba(200,220,255,0)');
        grad.addColorStop(0.4, `rgba(200,220,255,${alpha * 0.5})`);
        grad.addColorStop(0.6, `rgba(200,220,255,${alpha * 0.5})`);
        grad.addColorStop(1, 'rgba(200,220,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 6, p.size, p.size * 12);
        ctx.restore();
        break;
      }
      case 'pedestrian': {
        // Dark shadow blobs drifting across
        ctx.save();
        ctx.globalAlpha *= alpha;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, 'rgba(0,0,0,0.12)');
        grad.addColorStop(0.6, 'rgba(0,0,0,0.04)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        // Elongated vertically (shadow of person)
        ctx.scale(0.6, 1.4);
        ctx.fillRect(
          (p.x - p.size) / 0.6,
          (p.y - p.size) / 1.4,
          (p.size * 2) / 0.6,
          (p.size * 2) / 1.4,
        );
        ctx.restore();
        break;
      }
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number) {
    switch (this.envType) {
      case 'street': {
        // Subtle warm tint at bottom (reflected city light)
        const grad = ctx.createLinearGradient(0, h * 0.7, 0, h);
        grad.addColorStop(0, 'rgba(255,180,100,0)');
        grad.addColorStop(1, 'rgba(255,180,100,0.03)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, h * 0.7, w, h * 0.3);
        break;
      }
      case 'shopping': {
        // Warm ambient overhead light
        const grad = ctx.createLinearGradient(0, 0, 0, h * 0.3);
        grad.addColorStop(0, 'rgba(255,240,200,0.04)');
        grad.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h * 0.3);
        break;
      }
      case 'elevator': {
        // Cool fluorescent tint
        const flicker = 1 + Math.sin(this.frameCount * 0.05) * 0.01;
        ctx.fillStyle = `rgba(180,200,255,${0.015 * flicker})`;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'pedestrian': {
        // Slight warm sunlight from top
        const grad = ctx.createLinearGradient(0, 0, 0, h * 0.4);
        grad.addColorStop(0, 'rgba(255,250,220,0.03)');
        grad.addColorStop(1, 'rgba(255,250,220,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h * 0.4);
        break;
      }
    }
  }
}
