import { Renderer, Program, Mesh, Triangle } from 'ogl';
import React, { useEffect, useRef } from 'react';

function hexToVec3(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  ];
}

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform float uSpeed;
uniform float uBrightness;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uPulse;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= uResolution.z; // aspect ratio

  float r = length(p);
  float z = 1.0 / (r + 0.02);
  float theta = atan(p.y, p.x);

  // 1. Alternating 3D fanning sectors
  float sectorCount = 12.0;
  float angle = theta + uTime * 0.05; // slowly rotate
  float sectorId = floor(angle * (sectorCount / 6.2831853));
  float sectorLight = mod(sectorId, 2.0);

  // Background base colors
  vec3 colorA = vec3(0.04, 0.01, 0.03); // deep dark rose-tint
  vec3 colorB = vec3(0.02, 0.01, 0.04); // deep dark violet-tint
  vec3 sectorColor = mix(uColor1, uColor2, sin(theta * 2.0 + uTime * 0.5) * 0.5 + 0.5);

  vec3 baseCol = mix(colorA, colorB, sectorLight);
  baseCol += sectorColor * (0.04 * (1.0 - sectorLight));

  // Assemble channels
  vec3 col = baseCol;

  float alpha = clamp(length(col), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

interface CyberTunnelProps {
  speed?: number;
  brightness?: number;
  color1?: string;
  color2?: string;
  color3?: string;
  pulseRef?: React.MutableRefObject<number>;
}

export default function CyberTunnel({
  speed = 0.3,
  brightness = 0.5,
  color1 = '#7c3aed',
  color2 = '#f43f5e',
  color3 = '#38bdf8',
  pulseRef
}: CyberTunnelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    let program: Program;

    function resize() {
      renderer.setSize(container.offsetWidth, container.offsetHeight);
      if (program) {
        program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height];
      }
    }
    window.addEventListener('resize', resize);

    resize();

    const geometry = new Triangle(gl);
    program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height] },
        uSpeed: { value: speed },
        uBrightness: { value: brightness },
        uColor1: { value: hexToVec3(color1) },
        uColor2: { value: hexToVec3(color2) },
        uColor3: { value: hexToVec3(color3) },
        uPulse: { value: 0.0 }
      }
    });

    const mesh = new Mesh(gl, { geometry, program });
    container.appendChild(gl.canvas);

    let animationFrameId: number;

    function update(time: number) {
      animationFrameId = requestAnimationFrame(update);
      program.uniforms.uTime.value = time * 0.001;
      
      if (pulseRef) {
        program.uniforms.uPulse.value = pulseRef.current;
      }

      renderer.render({ scene: mesh });
    }
    animationFrameId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [speed, brightness, color1, color2, color3, pulseRef]);

  return <div ref={containerRef} className="w-full h-full" />;
}
