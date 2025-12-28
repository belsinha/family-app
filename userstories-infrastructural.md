- Frontend Infrastructure (React + TypeScript + Tailwind + Icons)
1. React app scaffold

User Story:
As the application, I want a React project initialized with TypeScript, so that all frontend code is type-safe and consistent.

2. Component structure

User Story:
As the application, I want a flat and predictable component folder structure, so that an LLM can easily locate and modify UI components.

3. Tailwind CSS setup

User Story:
As the application, I want Tailwind CSS configured globally, so that all styling can be done using utility classes instead of custom CSS files.

4. Icon system

User Story:
As the application, I want to use a single icon library (Font Awesome or Google Material Icons), so that icons are consistent and easy to reference by name.

5. Global layout component

User Story:
As the application, I want a reusable layout component (header + main content), so that all screens share the same structure.

6. State handling

User Story:
As the application, I want to use simple React state and props instead of complex state management libraries, so that behavior remains predictable for an LLM.

7. API communication layer

User Story:
As the application, I want a single API utility file for all HTTP requests, so that backend communication is centralized and easy to update.

- Backend Infrastructure (Node.js + TypeScript)
8. Node.js server scaffold

User Story:
As the application, I want a Node.js server written in TypeScript, so that backend logic uses the same typing conventions as the frontend.

9. Express setup

User Story:
As the application, I want Express configured with minimal middleware, so that request handling remains explicit and readable.

10. REST endpoint structure

User Story:
As the application, I want REST endpoints grouped by resource (users, children, points), so that routing is clear and mechanical.

11. Environment configuration

User Story:
As the application, I want environment variables stored in a single configuration file, so that secrets and ports are not hardcoded.

12. Error handling

User Story:
As the application, I want simple and consistent error responses, so that the frontend and LLM can reliably interpret failures.

- Database Infrastructure (SQLite)
13. SQLite database initialization

User Story:
As the application, I want an SQLite database file created automatically on startup, so that no manual database setup is required.

14. Database schema definition

User Story:
As the application, I want database tables defined in one place, so that an LLM can understand the entire schema at once.

15. Data access layer

User Story:
As the application, I want database queries wrapped in simple functions, so that SQL logic is separated from routing logic.

16. Points persistence

User Story:
As the application, I want bonus and demerit points stored as integers linked to a child record, so that balances can be calculated deterministically.

- Authentication & Roles (Minimal)
17. Role distinction

User Story:
As the application, I want a simple role field (parent, child, family), so that permissions can be enforced without complex auth systems.

18. No external auth providers

User Story:
As the application, I want to avoid third-party authentication services, so that the system remains fully deterministic for an LLM.

- Integration & Consistency
19. Shared types

User Story:
As the application, I want shared TypeScript types between frontend and backend, so that data shapes never drift.

20. Predictable naming conventions

User Story:
As the application, I want consistent naming for files, functions, and endpoints, so that an LLM can infer intent without ambiguity.

21. Minimal dependencies

User Story:
As the application, I want to use as few libraries as possible, so that dependency behavior remains transparent.

-  Development Simplicity
22. Seed data

User Story:
As the application, I want seed data generated on startup, so that the system is usable immediately without manual input.
Children = Isabel, Nicholas, Laura
Parents = Rommel, Celiane
Houses = Campo Bom, Morro Grande 149, Morro Grande 177, Tubarao, Brooksville, Terrenos

23. Logging

User Story:
As the application, I want simple console logging for requests and database actions, so that system behavior is observable.

24. Deterministic behavior

User Story:
As the application, I want to avoid random values and implicit behavior, so that outputs are reproducible and testable by an LLM.