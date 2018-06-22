
class nullLogger {
    error(message: string) {
        // null
    }

    log(message: string) {
        //
    }

    debug(message: string) {
        //
    }
}

export namespace Logger {
    const _logger = console;
    // const _logger = new nullLogger();

    export function error(message: string) {
        _logger.error(message);
    }

    export function log(message: string) {
        _logger.log(message);
    }

    export function debug(message: string) {
        _logger.debug(message);
    }
}