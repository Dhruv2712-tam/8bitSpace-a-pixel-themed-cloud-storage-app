import * as Sentry from '@sentry/react';

// A browser DSN is a public routing key, not a Sentry API credential.
const dsn = 'https://e1b7e7c60c77edfa8025bcc001cb5967@o4512136443789312.ingest.us.sentry.io/4512136632270848';

export function stripPrivateErrorData(event) {
  // This app stores private filenames and handles OAuth callback URLs. Keep only
  // the error type and code location needed to diagnose a browser exception.
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  delete event.contexts;
  delete event.tags;
  delete event.transaction;
  delete event.message;
  delete event.fingerprint;
  for (const exception of event.exception?.values || []) {
    exception.value = 'Application error';
    delete exception.mechanism;
    for (const frame of exception.stacktrace?.frames || []) {
      if (frame.filename) {
        try {
          const url = new URL(frame.filename);
          frame.filename = `${url.origin}${url.pathname}`;
        } catch {
          frame.filename = '[source]';
        }
      }
      delete frame.context_line;
      delete frame.pre_context;
      delete frame.post_context;
      delete frame.vars;
    }
  }
  return event;
}

if (import.meta.env.PROD) {
  Sentry.init({
    dsn,
    environment: 'production',
    sendDefaultPii: false,
    defaultIntegrations: false,
    integrations: [Sentry.globalHandlersIntegration(), Sentry.dedupeIntegration()],
    beforeSend: stripPrivateErrorData,
  });
}
