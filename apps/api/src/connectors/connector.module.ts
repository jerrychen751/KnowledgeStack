import { Module } from "@nestjs/common";

import { ConnectorRegistry } from "./connector.registry.js";

@Module({
  providers: [ConnectorRegistry],
  exports: [ConnectorRegistry],
})
export class ConnectorModule {}
