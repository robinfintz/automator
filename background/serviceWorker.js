/**
 * Service worker entry: initializes the event logger.
 * No other logic here; keeps background minimal and testable.
 */

import { init } from './eventLogger.js';

init();
