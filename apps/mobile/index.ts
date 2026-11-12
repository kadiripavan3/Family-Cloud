// The app's entry: what runs first when the app's code loads, on a phone, in the browser and in tests of the
// bundle. Expo Router's own entry does everything else.
//
// The one thing that has to come before it: the pinned note (Jot) names the task Android runs when the note
// is answered while the app is closed. The app's code is then started unseen and no screen is drawn, so the
// task has to be named here, not in a screen. In a browser and in Expo Go that import does nothing.
import '@/features/jot/pinned/early';
import 'expo-router/entry';
