# Network Connectivity Check

## Requirements
- **Both devices must be on the same WiFi network**
- They don't need the same IP address, just the same network subnet
- Example: Computer `10.50.218.180` and Phone `10.50.218.123` ✅ (same network)
- Example: Computer `10.50.218.180` and Phone `192.168.1.100` ❌ (different networks)

## How to Check

### On Your Phone (iOS):
1. Open Settings > WiFi
2. Tap the (i) icon next to your connected WiFi network
3. Look for "IP Address" - it should start with `10.50.218.` (same as your computer)

### On Your Phone (Android):
1. Open Settings > WiFi
2. Long press your connected WiFi network
3. Tap "Network details" or "Manage network"
4. Look for "IP Address" - it should start with `10.50.218.`

## Test Connectivity

### From Your Phone's Browser:
Try opening this URL in Safari/Chrome on your phone:
```
http://10.50.218.180:8000/health
```

**If this works:**
- ✅ Network is fine
- ✅ Backend is accessible
- Issue is likely in the app configuration

**If this doesn't work:**
- ❌ Devices might be on different WiFi networks
- ❌ Router might block device-to-device communication
- ❌ Firewall might be blocking port 8000

## Common Issues

### Different WiFi Networks
- **Problem**: Phone on WiFi "Network A", Computer on WiFi "Network B"
- **Solution**: Connect both to the same WiFi network

### Guest Network
- **Problem**: One device on guest network (often isolated from other devices)
- **Solution**: Connect both to the main network (not guest)

### Router Isolation
- **Problem**: Router has "AP Isolation" or "Client Isolation" enabled
- **Solution**: Disable isolation in router settings (allows devices to talk to each other)

### Firewall
- **Problem**: macOS firewall blocking incoming connections
- **Solution**: System Preferences > Security & Privacy > Firewall > Allow Python through firewall

