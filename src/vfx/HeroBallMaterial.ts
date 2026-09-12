import * as THREE from 'three';

export interface HeroBallUniforms {
  readonly time: { value: number };
  readonly energy: { value: number };
  readonly impact: { value: number };
  readonly direction: { value: THREE.Vector3 };
}

export function createHeroBallMaterial(): { material: THREE.ShaderMaterial; uniforms: HeroBallUniforms } {
  const uniforms: HeroBallUniforms = {
    time: { value: 0 },
    energy: { value: 0 },
    impact: { value: 0 },
    direction: { value: new THREE.Vector3(0, 0, 1) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.time,
      uEnergy: uniforms.energy,
      uImpact: uniforms.impact,
      uDirection: uniforms.direction,
    },
    vertexShader: `
      uniform float uTime;
      uniform float uEnergy;
      uniform float uImpact;
      uniform vec3 uDirection;
      varying vec3 vNormalW;
      varying vec3 vPositionW;

      float tendril(vec3 n, vec3 d) {
        float alignment = max(dot(normalize(n), normalize(d)), 0.0);
        return pow(alignment, 10.0);
      }

      void main() {
        vec3 n = normalize(normal);
        float wave = sin((n.x * 7.0 + n.y * 9.0 + n.z * 5.0) + uTime * 9.0) * 0.5 + 0.5;
        float magnetic = tendril(n, uDirection) + 0.45 * tendril(n, -uDirection);
        float deformation = uEnergy * (0.035 + wave * 0.045) + uImpact * magnetic * (0.12 + uEnergy * 0.28);
        vec3 displaced = position + n * deformation;
        vec4 world = modelMatrix * vec4(displaced, 1.0);
        vPositionW = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * n);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uEnergy;
      uniform float uImpact;
      varying vec3 vNormalW;
      varying vec3 vPositionW;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vPositionW);
        float fresnel = pow(1.0 - max(dot(normalize(vNormalW), viewDir), 0.0), 2.2);
        vec3 core = mix(vec3(0.82, 0.98, 1.0), vec3(0.43, 0.55, 1.0), uEnergy);
        vec3 rim = mix(vec3(0.2, 0.75, 1.0), vec3(1.0, 0.38, 0.78), uEnergy);
        vec3 color = core * (1.25 + uImpact * 0.6) + rim * fresnel * (1.4 + uEnergy * 1.6);
        float alpha = 0.92 + fresnel * 0.08;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: true,
    toneMapped: false,
  });

  return { material, uniforms };
}
