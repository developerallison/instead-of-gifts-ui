# Insteadofgifts

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.0.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Project Documentation

- Architecture: `docs/ARCHITECTURE.md`
- Project overview: `docs/PROJECT.md`

## Celebration Created Email Notification

When a signed-in user creates a celebration, the app invokes the
`send-celebration-created-email` Supabase Edge Function so
`developer@insteadofgifts.com` receives a notification.

Required Supabase secrets for this function:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (must be a verified Resend sender)
- `CELEBRATION_ALERT_TO_EMAIL` (optional, defaults to `developer@insteadofgifts.com`)

Example:

```bash
supabase secrets set \
	RESEND_API_KEY=re_xxx \
	RESEND_FROM_EMAIL="Instead of Gifts <notifications@insteadofgifts.com>" \
	CELEBRATION_ALERT_TO_EMAIL=developer@insteadofgifts.com
```
