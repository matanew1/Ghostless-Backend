/**
 * @file Nest module providing the shared {@link NetworkService}.
 * @module @ghostless/network
 */

import { Global, Module } from '@nestjs/common';
import { NETWORK_SERVICE } from './network.port';
import { DEFAULT_TIMEOUT_MS, NetworkService } from './network.service';

/**
 * Exposes {@link NetworkService} both as a class provider (for typed injection)
 * and behind the {@link NETWORK_SERVICE} token (for ports/adapters).
 */
@Global()
@Module({
  providers: [
    {
      provide: NetworkService,
      useFactory: () =>
        new NetworkService(Number(process.env.NETWORK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
    },
    {
      provide: NETWORK_SERVICE,
      useExisting: NetworkService,
    },
  ],
  exports: [NetworkService, NETWORK_SERVICE],
})
export class NetworkModule {}
