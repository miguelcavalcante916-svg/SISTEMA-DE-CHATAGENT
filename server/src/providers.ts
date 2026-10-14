import type { AppConfig } from './config.js';
import type { ProviderRegistry } from './context.js';
import { OllamaProvider } from './modules/ai/ollama.js';
import { MessagingRegistry } from './modules/messaging/provider.js';
import { SimulatorProvider } from './modules/messaging/simulator.js';
import { PrinterRegistry } from './modules/printing/provider.js';
import { BrowserPrintProvider } from './modules/printing/browser.js';
import { EscPosNetworkProvider } from './modules/printing/escpos.js';

/** Provedores padrão. Testes podem substituir qualquer um deles. */
export function createDefaultProviders(config: AppConfig, overrides: Partial<ProviderRegistry> = {}): ProviderRegistry {
  const messaging = overrides.messaging ?? new MessagingRegistry();
  if (!overrides.messaging) {
    messaging.register(new SimulatorProvider());
  }
  const printers = overrides.printers ?? new PrinterRegistry();
  if (!overrides.printers) {
    printers.register(new BrowserPrintProvider());
    printers.register(new EscPosNetworkProvider());
  }
  return {
    ai: overrides.ai ?? new OllamaProvider({ baseUrl: config.ollamaBaseUrl, model: config.ollamaModel, timeoutMs: config.aiTimeoutMs }),
    messaging,
    printers,
  };
}
