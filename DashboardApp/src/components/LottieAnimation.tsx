import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

interface LottieAnimationProps {
  source: any; // Asset or require() path
  size?: number;
  loop?: boolean;
  autoPlay?: boolean;
  speed?: number;
}

export default function LottieAnimation({ 
  source, 
  size = 56, 
  loop = true,
  autoPlay = true,
  speed = 1
}: LottieAnimationProps) {
  const animationRef = useRef<LottieView>(null);

  useEffect(() => {
    if (autoPlay && animationRef.current) {
      animationRef.current.play();
    }
  }, [autoPlay]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <LottieView
        ref={animationRef}
        source={source}
        style={styles.animation}
        loop={loop}
        autoPlay={autoPlay}
        speed={speed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  animation: {
    width: '100%',
    height: '100%',
  },
});

