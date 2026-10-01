"use client";

import React, { useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

/**
 * Animated 3D Distorted Sphere Mesh
 * Gentle, organic wave distortion with warm peach/orange and soft lavender lighting.
 */
function SoftGlowingOrb() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const outerGlowRef = useRef<THREE.Mesh>(null!);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    if (meshRef.current) {
      // Gentle, slow multi-axis rotation
      meshRef.current.rotation.x += delta * 0.12;
      meshRef.current.rotation.y += delta * 0.16;
      meshRef.current.rotation.z += delta * 0.06;

      // Soft sinusoidal breathing pulse
      const scale = 1 + Math.sin(t * 1.1) * 0.035;
      meshRef.current.scale.set(scale, scale, scale);
    }

    if (outerGlowRef.current) {
      // Counter-rotating outer atmospheric halo
      outerGlowRef.current.rotation.y -= delta * 0.08;
      outerGlowRef.current.rotation.x -= delta * 0.06;
      const glowScale = 1.12 + Math.sin(t * 1.1 + 0.5) * 0.03;
      outerGlowRef.current.scale.set(glowScale, glowScale, glowScale);
    }
  });

  return (
    <group>
      {/* 1. Core Organic Living Morphing Sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.45, 96, 96]} />
        <MeshDistortMaterial
          color="#FB923C" // Warm orange base
          emissive="#EC4899" // Soft pink emissive glow
          emissiveIntensity={0.55}
          roughness={0.2} // Low roughness = soft glowing light source texture
          metalness={0.02} // Low metalness prevents flat plastic look
          distort={0.2} // Gentle organic wave distortion
          speed={1.4} // Calm breathing speed
          clearcoat={0.6} // Glossy satin sheen
          clearcoatRoughness={0.2}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* 2. Volumetric 3D Optical Bloom Aura (native Three.js) */}
      <mesh ref={outerGlowRef}>
        <sphereGeometry args={[1.58, 48, 48]} />
        <meshBasicMaterial
          color="#C084FC"
          transparent
          opacity={0.25}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Fallback CSS Animated Gradient Orb
 * Rendered when WebGL is unsupported or while 3D canvas loads.
 */
export function FallbackCSSOrb() {
  return (
    <div className="orb-container">
      <div className="orb-glow" />
      <div className="orb-body">
        <div className="orb-highlight" />
      </div>
    </div>
  );
}

/**
 * Check if WebGL context is available on the current device
 */
function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/**
 * Exported ThreeOrb Component
 * Fully transparent canvas, 40px blurred radial gradient glow, and smooth fading halo
 */
export function ThreeOrb() {
  const [canRenderWebGL, setCanRenderWebGL] = useState<boolean | null>(null);

  useEffect(() => {
    setCanRenderWebGL(isWebGLAvailable());
  }, []);

  if (canRenderWebGL === null || !canRenderWebGL) {
    return <FallbackCSSOrb />;
  }

  return (
    <div className="relative w-[150px] h-[150px] sm:w-[165px] sm:h-[165px] mx-auto select-none flex items-center justify-center overflow-visible bg-transparent border-none shadow-none">
      {/* 1. Seamless radial gradient glow fading out smoothly (no box edges) */}
      <div
        className="absolute -inset-12 rounded-full pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(circle, rgba(249, 115, 22, 0.38) 0%, rgba(244, 114, 182, 0.28) 40%, rgba(192, 132, 252, 0.18) 60%, transparent 75%)",
          filter: "blur(40px)",
        }}
      />

      {/* 2. 3D WebGL Canvas with fully transparent background */}
      <Suspense fallback={<FallbackCSSOrb />}>
        <Canvas
          camera={{ position: [0, 0, 4.4], fov: 46 }}
          dpr={[1, 1.8]}
          style={{ background: "transparent" }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
          }}
          className="w-full h-full cursor-grab active:cursor-grabbing relative z-10 bg-transparent border-none shadow-none"
        >
          {/* Multi-colored light balance blending warm orange, soft pink, and lavender */}
          <ambientLight intensity={0.9} color="#FFF7ED" />
          <directionalLight position={[3.5, 4, 3]} intensity={1.6} color="#FB923C" />
          <pointLight position={[-4, -2.5, -2]} intensity={2.4} color="#F472B6" />
          <pointLight position={[1, -3.5, 2.5]} intensity={1.4} color="#C084FC" />
          <pointLight position={[0, 4, 2]} intensity={1.0} color="#FDBA74" />

          {/* Living breathing morphing glowing sphere */}
          <SoftGlowingOrb />
        </Canvas>
      </Suspense>
    </div>
  );
}

