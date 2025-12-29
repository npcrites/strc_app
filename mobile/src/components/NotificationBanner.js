/**
 * Notification banner component - displays important notifications
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export default function NotificationBanner() {
  const { token } = useAuth();
  const [notification, setNotification] = useState(null);
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const data = await api.get('/notifications?unread_only=true&limit=1', token);
      if (data.notifications && data.notifications.length > 0) {
        setNotification(data.notifications[0]);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const handleDismiss = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setNotification(null);
    });
  };

  if (!notification) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.content}>
        <Text style={styles.title}>{notification.title}</Text>
        <Text style={styles.message}>{notification.message}</Text>
      </View>
      <TouchableOpacity onPress={handleDismiss} style={styles.dismissButton}>
        <Text style={styles.dismissText}>×</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ff9800',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  message: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
  },
  dismissButton: {
    padding: 4,
    marginLeft: 8,
  },
  dismissText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
});


