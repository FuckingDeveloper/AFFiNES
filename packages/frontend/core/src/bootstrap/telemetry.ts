import { sentry, tracker } from '@affine/track';

// MRH TrackWork is an internal product and never initializes telemetry or
// remote error reporting transports.
sentry.disable();
tracker.opt_out_tracking();
