import * as THREE from 'three';
import type { DisplaySettings } from '@dooh/core';
import { glassVertexShader, glassFragmentShader } from '../shaders/glass-overlay.glsl';

/**
 * GlassOverlayEngine manages the glass layer rendered on top of
 * the LED screen with Fresnel reflections, roughness, and tinting.
 */
export class GlassOverlayEngine {
  public readonly glassMaterial: THREE.ShaderMaterial;

  constructor(roughness = 0.15, reflectivity = 0.08) {
    this.glassMaterial = new THREE.ShaderMaterial({
      vertexShader: glassVertexShader,
      fragmentShader: glassFragmentShader,
      uniforms: {
        uRoughness: { value: roughness },
        uReflectivity: { value: reflectivity },
        uTintColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        uEnvMap: { value: null },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
  }

  updateSettings(settings: Partial<Pick<DisplaySettings, 'glassRoughness' | 'glassReflectivity'>>) {
    if (settings.glassRoughness !== undefined) {
      this.glassMaterial.uniforms.uRoughness.value = settings.glassRoughness;
    }
    if (settings.glassReflectivity !== undefined) {
      this.glassMaterial.uniforms.uReflectivity.value = settings.glassReflectivity;
    }
  }

  setTint(r: number, g: number, b: number) {
    this.glassMaterial.uniforms.uTintColor.value.set(r, g, b);
  }

  dispose() {
    this.glassMaterial.dispose();
  }
}
