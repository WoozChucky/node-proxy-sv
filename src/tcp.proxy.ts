import util from "util";
import fs from "fs";
import tls, { TLSSocket } from "tls";
import net, { LookupFunction, Server, Socket } from "net";

import { parseHosts, parsePorts, parseTLS, uniqueKey } from "./utils/net";
import { ProxySetupOptions } from "./options/proxy-setup-options";
import { ProxyTLSOptions } from "./options/proxy-tls-options";
import { ServiceTLSOptions } from "./options/service-tls-options";
import {
  ContextBase,
  DownstreamContext,
  DownstreamInterceptor,
  ServiceHost,
  ServicePort,
  ServiceTLS,
  UpstreamContext,
  UpstreamInterceptor,
} from "./context";

export interface Dictionary<T> {
  [index: string]: T;
}

export default class TcpProxy {
  private static writeBuffer(context: ContextBase) {
    context.connected = true;
    if (context.buffers.length > 0) {
      for (const buffer of context.buffers) {
        context.serviceSocket?.write(buffer);
      }
    }
  }

  private readonly proxyPort: number;
  private readonly serviceHosts: string | string[];
  private readonly servicePorts: string | string[];
  private readonly serviceTLS: boolean[];
  private readonly options?: Partial<ProxySetupOptions>;
  private serviceHostIndex: number;
  private readonly proxyTLSOptions: ProxyTLSOptions;
  private readonly servicesTLSOptions: ServiceTLSOptions;
  private readonly proxySockets: Dictionary<Socket>;
  private readonly users: string[];
  private readonly allowedIPs: string[];
  private server: Server;

  /**
   * The constructor stuffings
   * @param selfPort
   * @param destinationHosts
   * @param destinationPort
   * @param destinationTLS
   * @param options
   */
  constructor(
    selfPort: number,
    destinationHosts: ServiceHost,
    destinationPort: ServicePort,
    destinationTLS: ServiceTLS,
    options?: Partial<ProxySetupOptions>
  ) {
    this.proxyPort = selfPort;
    this.serviceHosts = parseHosts(destinationHosts);
    this.servicePorts = parsePorts(destinationPort);
    this.serviceTLS = parseTLS(destinationTLS);
    this.serviceHostIndex = -1;
    this.options = options;

    // Proxy TLS setup

    this.proxyTLSOptions = {
      passphrase: this.options?.passphrase || "",
      pfx: Buffer.of(),
      secureProtocol: "TLSv1_2_method",
    };

    if (this.options?.tls) {
      this.proxyTLSOptions.pfx = fs.readFileSync(
        this.options.pfx || "./cert.pfx"
      );
    }

    // Service TLS setup

    this.servicesTLSOptions = {
      rejectUnauthorized: this.options?.rejectUnauthorized || false,
      secureProtocol: "TLSv1_2_method",
    };

    this.proxySockets = {} as Dictionary<Socket>;

    if (this.options?.identUsers && this.options?.identUsers.length > 0) {
      this.users = this.options.identUsers;
      this.log("Will only allow these users: ".concat(this.users.join(", ")));
    } else {
      this.users = [];
      this.log("Will allow all users");
    }

    if (this.options?.allowedIPs && this.options.allowedIPs.length !== 0) {
      this.allowedIPs = this.options.allowedIPs;
    } else {
      this.allowedIPs = [];
    }

    // setup proxy socket server
    if (this.options?.tls) {
      this.server = tls.createServer(
        this.options.customTlsOptions || this.proxyTLSOptions,
        this.handleClientConnection.bind(this)
      );
    } else {
      this.server = net.createServer(this.handleClientConnection.bind(this));
    }
    this.server.listen(
      this.proxyPort,
      this.options?.hostname || "get_machine_hostname"
    );
  }

  private handleClientConnection(socket: Socket | TLSSocket): void {
    if (this.users.length > 0) {
      this.handleAuth(socket);
    } else {
      this.handleClient(socket);
    }
  }

  private handleAuth(proxySocket: Socket) {
    if (this.allowedIPs.includes(proxySocket.remoteAddress || "")) {
      this.handleClient(proxySocket);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self: TcpProxy = this;
    const query = util.format("%d, %d", proxySocket.remotePort, this.proxyPort);
    const identitySocket = new net.Socket();
    let response = "";
    let hasResponse = false;
    identitySocket.on("error", function (err: Error) {
      hasResponse = false;
      identitySocket.destroy();
    });
    identitySocket.on("data", function (data: Buffer) {
      response = data.toString().trim();
      hasResponse = true;
      identitySocket.destroy();
    });
    identitySocket.on("close", function (hadError: boolean) {
      if (!hasResponse && !response) {
        self.log("No identity");
        proxySocket.destroy();
        return;
      }
      const user = response.split(":").pop();
      if (self.users.includes(user || "")) {
        self.handleClient(proxySocket);
      } else {
        self.log(util.format('User "%s" unauthorized', user));
        proxySocket.destroy();
      }
    });
    identitySocket.connect(113, proxySocket.remoteAddress || "", function () {
      identitySocket.write(query);
      identitySocket.end();
    });
  }

  private handleClient(proxySocket: Socket): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self: TcpProxy = this;
    const key = uniqueKey(proxySocket);
    this.proxySockets[`${key}`] = proxySocket;
    const context = {
      buffers: [],
      connected: false,
      proxySocket,
      serviceSocket: undefined,
    } as ContextBase;

    proxySocket.on("data", (data: Buffer) => {
      self.handleUpstreamData(context, data);
    });
    proxySocket.on("close", (hadError: boolean) => {
      delete self.proxySockets[uniqueKey(proxySocket)];
      if (context.serviceSocket !== undefined) {
        context.serviceSocket.destroy();
      }
    });
    proxySocket.on("error", function (err: Error) {
      if (context.serviceSocket !== undefined) {
        context.serviceSocket.destroy();
      }
    });
  }

  private handleUpstreamData(context: UpstreamContext, data: Buffer) {
    let processedData: Buffer;

    if (this.options?.upstream) {
      processedData = this.options.upstream(context, data);
    } else {
      processedData = data;
    }

    if (context.connected) {
      context.serviceSocket?.write(processedData);
    } else {
      context.buffers[context.buffers.length] = processedData;
      if (context.serviceSocket === undefined) {
        this.createServiceSocket(context);
      }
    }
  }

  private createServiceSocket(context: ContextBase): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const connectOptions = self.parseServiceOptions(context);

    if (self.serviceTLS[connectOptions.serviceIndex]) {
      context.serviceSocket = tls.connect(connectOptions, function () {
        TcpProxy.writeBuffer(context);
      });
    } else {
      context.serviceSocket = new net.Socket();
      context.serviceSocket.connect(connectOptions, function () {
        TcpProxy.writeBuffer(context);
      });
    }

    context.serviceSocket.on("data", function (data: Buffer) {
      let processedData: Buffer;

      if (self.options?.downstream) {
        processedData = self.options.downstream(context, data);
      } else {
        processedData = data;
      }
      context.proxySocket.write(processedData);
    });
    context.serviceSocket.on("close", function (hadError: boolean) {
      if (context.proxySocket !== undefined) {
        context.proxySocket.destroy();
      }
    });
    context.serviceSocket.on("error", function (err: Error) {
      if (context.proxySocket !== undefined) {
        context.proxySocket.destroy();
      }
    });
  }

  private parseServiceOptions(context: ContextBase) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const i = self.getServiceHostIndex(context.proxySocket);
    return {
      serviceIndex: i,
      port: parseInt(self.servicePorts[i], 10),
      host: self.serviceHosts[i],
      localAddress: self.options?.localAddress,
      localPort: self.options?.localPort,
      ...self.servicesTLSOptions,
    };
  }

  private getServiceHostIndex(proxySocket: Socket | TLSSocket): number {
    this.serviceHostIndex++;
    if (this.serviceHostIndex === this.serviceHosts.length) {
      this.serviceHostIndex = 0;
    }
    let index = this.serviceHostIndex;
    if (this.options?.serviceHostSelected) {
      index = this.options.serviceHostSelected(proxySocket, index);
    }
    return index;
  }

  private log(message: string): void {
    if (!this.options?.quiet) {
      // eslint-disable-next-line no-console
      console.log(message);
    }
  }
}
