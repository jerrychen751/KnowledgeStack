### Dependency Injection
NestJS uses the controller-service-repository organization, where each feature may have one or more of these. NestJS orchestrates these through "modules".
- Module: Groups a feature and tells Nest how its pieces connect.
- Controller: Handles HTTP request endpoints and orchestrates services to respond.
- Service: Abstracts away business logic to perform the majority of the work for controller.
- Repository: Abstracts away raw database queries into methods used by service.

`@Module({...})` is a class decorator, which takes in a JavaScript object defining metadata that tells NestJS what the module does in the big picture of the application's object graph. It has 4 main keys:
- Imports: List of module classes that this module depends on (i.e., that module contains some service we want to use). Objects in this list must export for Dependency Injection to work.
- Controllers: List of controller classes that handle requests.
- Providers: List of injectable objects that belong to this module (services, repositories). Providers are encapsulated by default, and can only be injected if defined in current module's `providers` or exported by another module that this module imports.
- Exports: List of providers or imported modules that this module exposes to other modules.