/// <reference types="node" />

export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

type Meta = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug:   10,
    info:    20,
    warning: 30,
    error:   40,
};

const COLOR: Record<LogLevel, string> = {
    debug:   '\x1b[35m',
    info:    '\x1b[32m',
    warning: '\x1b[33m',
    error:   '\x1b[31m',
};

const APP_COLOR = '\x1b[32m';
const CONTEXT_COLOR = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const LEVEL_WIDTH = 7;

export interface Log {
    debug:   (message: string, meta?: Meta) => void;
    info:    (message: string, meta?: Meta) => void;
    warning: (message: string, meta?: Meta) => void;
    error:   (message: string, meta?: Meta) => void;
}

class LogService implements Log {

    private override: LogLevel | null = null;

    private appName = 'App';

    // Read per call so loggers created before dotenv still use its configuration.
    private get threshold(): number {
        if (this.override)
            return LEVEL_ORDER[this.override];

        const level = (process.env.LOG_LEVEL ?? 'info').trim().toLowerCase();

        switch (level) {
            case 'debug':
            case 'info':
            case 'warning':
            case 'error':
                return LEVEL_ORDER[level];
            default:
                return LEVEL_ORDER.info;
        }
    }

    public setLevel(level: LogLevel): void {
        this.override = level;
    }

    public setAppName(name: string): void {
        this.appName = name;
    }

    private get app(): string {
        return process.env.LOG_APP_NAME?.trim() || this.appName;
    }

    public withContext(context: string): Log {
        return {
            debug:   (message, meta) => this.write('debug', message, meta, context),
            info:    (message, meta) => this.write('info', message, meta, context),
            warning: (message, meta) => this.write('warning', message, meta, context),
            error:   (message, meta) => this.write('error', message, meta, context),
        };
    }

    private write(level: LogLevel, message: string, meta?: Meta, context?: string): void {
        if (LEVEL_ORDER[level] < this.threshold)
            return;

        const color = COLOR[level];
        const app = `${APP_COLOR}[${this.app}]${RESET}`;
        const timestamp = process.env.LOG_TIMESTAMPS === 'false'
            ? ''
            : `${DIM}${new Date().toISOString()}${RESET} `;
        const tag = `${color}${level.toUpperCase().padStart(LEVEL_WIDTH)}${RESET}`;
        const scope = context ? ` ${CONTEXT_COLOR}[${context}]${RESET}` : '';

        // Callers measure elapsed time; ms is displayed as a trailing duration.
        const { ms, ...metadata } = meta ?? {};
        const duration = typeof ms === 'number' ? `${CONTEXT_COLOR}+${Math.round(ms)}ms${RESET}` : '';
        const head = `${app} ${timestamp}${tag}${scope} ${color}${message}${RESET}`;

        let sink = console.log;

        if (level === 'error')
            sink = console.error;
        else if (level === 'warning')
            sink = console.warn;

        const hasMetadata = Object.keys(metadata).length > 0;

        if (hasMetadata && duration)
            sink(head, metadata, duration);
        else if (hasMetadata)
            sink(head, metadata);
        else if (duration)
            sink(`${head} ${duration}`);
        else
            sink(head);
    }

    public debug = (message: string, meta?: Meta): void => this.write('debug', message, meta);

    public info = (message: string, meta?: Meta): void => this.write('info', message, meta);

    public warning = (message: string, meta?: Meta): void => this.write('warning', message, meta);

    public error = (message: string, meta?: Meta): void => this.write('error', message, meta);
}

class SystemImpl {

    public readonly log = new LogService();
}

// Each process has its own singleton and sets its name at startup.
export const System = new SystemImpl();
