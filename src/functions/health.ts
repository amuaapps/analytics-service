import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

function healthHandler(_request: HttpRequest, context: InvocationContext): HttpResponseInit {
  context.log('Health check requested');

  return {
    status: 200,
    jsonBody: {
      status: 'healthy',
      service: 'analytics-service',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    },
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
});
