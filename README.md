<div align="center">
  <h1>🕒 Huge-Clock</h1>
  <p>A modern, minimalist, yet feature-rich fullscreen clock and productivity suite designed to keep you deeply focused.</p>
  
  **[Live Demo](https://jacobhu0723.github.io/Huge-Clock/)** • **[Install PWA](#progressive-web-app)**

</div>

## ✨ Features

- **📺 Distraction-Free Display**: A massive, aesthetically pleasing clock interface. The mouse cursor automatically hides after a period of inactivity to maintain immersion.
- **🍅 Advanced Pomodoro Timer**: 
  - Manage focus with dedicated Focus & Break phases.
  - Track metrics including *Internal/External Interruptions*.
  - Assign estimations, complete tasks smoothly, and seamlessly log time across mid-night coding sessions.
  - Features smart modern interactions, including an iOS-inspired "long-press and swipe" to undo a completed session.
- **📝 Integrated Todo List**: Organize your day with "Today's Todos" and a backlog "Task List". Add, remove, and link tasks directly to your Pomodoro timer with fluid animations.
- **🎵 Chill Background Audio**: Built-in focus music. Play, pause, adjust volume, and switch tracks effortlessly using intuitive swipe gestures or keyboard shortcuts. Featuring a sleek Volume HUD.
- **📱 Fully Responsive & Touch-Friendly**: A tailored experience for both mouse and touch users. On mobile devices, enjoy smooth touch logic, gesture-based volume/track controls, and smart tactile responses.
- **🛡️ Screen Protection**: Keep your focus uninterrupted while taking care of your hardware. Includes `NoSleep` functionality to prevent screen lock, alongside **Always-On Display (AOD) Protection** to prevent screen burn-in.
- **⚡ Progressive Web App (PWA)**: Install it directly to your device (iOS/Android/Desktop) and use it offline, anytime, anywhere!

## ⌨️ Controls & Shortcuts

Huge-Clock offers an intuitive control scheme matching how you prefer to interact:

| Action | Desktop (Mouse / Keyboard) | Mobile (Touch / Gestures) |
| :--- | :--- | :--- |
| **Play / Pause Music** | Click the clock / `Space` | Tap the clock |
| **Switch Audio Track** | `←` / `→` arrow keys | Swipe Left / Right on screen |
| **Adjust Volume** | Mouse Scroll Wheel / `↑` / `↓` | Swipe Up / Down |
| **Toggle Fullscreen** | Double-click anywhere | Double-tap |
| **Pomodoro: Play/Pause** | `P` | Tap toggle button |
| **Pomodoro: Reset/Undo** | `R` (or Long-press UI button & swipe up) | Long-press reset button & swipe up |
| **Close Panels** | `Esc` | Tap close buttons |

## 🚀 Getting Started

Simply open the **[Live Website](https://jacobhu0723.github.io/Huge-Clock/)** in your browser. 

### Progressive Web App (PWA)
For the best experience, install Huge-Clock as an app:
- **Chrome / Edge**: Click the "Install app" icon in the right side of the address bar.
- **iOS Safari**: Tap the Share button and select "Add to Home Screen".
- **Android**: Tap the menu button and select "Add to Home Screen".

## 🧑‍💻 Development & Debugging

For developers tweaking the Pomodoro system, two global debug functions are exposed in the console for quick state manipulation:

- `_pomSkip(seconds = 10)`: Instantly fast-forwards the current Pomodoro timer, leaving only the specified seconds remaining. Ideal for testing phase transitions and notifications.
- `_pomNextDay()`: Simulates crossing over to the next day. Very useful for testing the logic around "midnight rollover", daily statistics clearing, and Todo task resets.

## 📜 License & History

This project has continually evolved from a simple big clock to a comprehensive productivity hub. Check the [Commit History](https://github.com/jacobhu0723/Huge-Clock/commits/main) for updates on the latest UI revamps, fluid gesture implementations, and Pomodoro system refactors.

Developed with Vanilla HTML, CSS, JavaScript, and ❤️.