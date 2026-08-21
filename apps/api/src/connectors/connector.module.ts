/**
 * This module handles communication with source providers (Notion, Confluence, filesystem uploads).
 *
 * This module constructs connectors from a complete set of connector options (which varies depending on the source provider). It purely contains logic to interact with the source providers; options are resolved through the database, which is handled by connector resolver in sync service.
 */

import { Module } from "@nestjs/common";

import { ConnectorFactory } from "./connector.factory.js";

@Module({
  providers: [ConnectorFactory],
  exports: [ConnectorFactory],
})
export class ConnectorModule {}
