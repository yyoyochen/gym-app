// Hash routing over the kit's navigation stack (ui/kit/navigation.ts): every
// go() is a real history entry, so Android's back gesture pops it and the
// page stack plays the pop animation. Kept as the screens' import point.
import { useNav } from './kit/navigation';

export { go, back, canGoBack, useNav } from './kit/navigation';

/** Current route segments, e.g. ['history', '<id>']. */
export function useRoute(): string[] {
  return useNav().segments;
}
