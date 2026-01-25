import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';
import { Asset } from 'expo-asset';
import { Renderer, loadAsync } from 'expo-three';
import * as THREE from 'three';

interface GLBModelProps {
  source: any; // Asset or require() path
  size?: number;
  rotationSpeed?: number;
  autoRotate?: boolean;
}

export default function GLBModel({ 
  source, 
  size = 56, 
  rotationSpeed = 0.01,
  autoRotate = true 
}: GLBModelProps) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const rendererRef = useRef<Renderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const onContextCreate = async (gl: any) => {

    // Create renderer using expo-three (handles React Native compatibility)
    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0x000000, 0); // Transparent background
    rendererRef.current = renderer;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      1000
    );
    camera.position.z = 3;
    cameraRef.current = camera;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Load GLB model
    try {
      const asset = Asset.fromModule(source);
      await asset.downloadAsync();
      
      const uri = asset.localUri || asset.uri;
      if (!uri) {
        console.error('No URI found for GLB asset');
        return;
      }

      console.log('Loading GLB from URI:', uri);
      
      // Use expo-three's loadAsync which handles React Native file loading properly
      // It internally patches Three.js loaders to work with React Native
      console.log('Using expo-three loadAsync...');
      const gltf = await loadAsync(uri);
      
      const model = gltf.scene;
      modelRef.current = model;
      
      // Scale model to fit
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / maxDim;
      model.scale.multiplyScalar(scale);
      model.position.sub(center.multiplyScalar(scale));

      scene.add(model);
      console.log('Model added to scene');

      // Handle animations if present
      if (gltf.animations && gltf.animations.length) {
        console.log('Found animations:', gltf.animations.length);
        mixerRef.current = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
          mixerRef.current?.clipAction(clip).play();
        });
      }
    } catch (error) {
      console.error('Error loading GLB:', error);
    }

    // Animation loop
    let isRendering = true;
    const render = () => {
      if (!isRendering || !rendererRef.current || !sceneRef.current || !cameraRef.current) {
        return;
      }

      try {
        // Update animations
        if (mixerRef.current) {
          mixerRef.current.update(clockRef.current.getDelta());
        }

        // Rotate model
        if (modelRef.current && autoRotate) {
          modelRef.current.rotation.y += rotationSpeed;
        }

        // Render the scene
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        gl.endFrameEXP();
        
        // Continue animation loop
        animationFrameRef.current = requestAnimationFrame(render);
      } catch (error) {
        console.error('Error in render loop:', error);
        isRendering = false;
      }
    };

    // Start render loop
    render();
    
    // Return cleanup function
    return () => {
      isRendering = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Reset refs
      sceneRef.current = null;
      modelRef.current = null;
      mixerRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  glView: {
    flex: 1,
  },
});
