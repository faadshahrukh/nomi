import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True when running inside the Expo Go app. Expo Go ships without some native modules (speech recognition, notifications), and even
 * loading them there logs an error, so features that need them check this first and fall back to their typed or on-screen alternative.
 * A development build or a store build has them.
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
