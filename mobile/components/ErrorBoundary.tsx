// Catches uncaught JS render errors anywhere below it and shows a recoverable
// screen instead of a blank crash. Note this is a JS-only safety net — it
// cannot catch native-level crashes (e.g. a native module aborting), only
// exceptions thrown during React's render/commit phases.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RefreshCw } from 'lucide-react-native';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] caught:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.root}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <TouchableOpacity style={styles.button} onPress={this.reset} activeOpacity={0.85}>
            <RefreshCw size={16} color="#fff" />
            <Text style={styles.buttonLabel}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#0F0B2E', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 13, color: '#0F0B2E99', textAlign: 'center', marginBottom: 20 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3906D2',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  buttonLabel: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
