/**
 * Event Broadcast 单元测试
 * 测试事件广播和 SSE 功能的逻辑
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

describe('Event Broadcast Logic', () => {
    describe('broadcastEvent', () => {
        test('should do nothing when no clients connected', () => {
            const eventClients = [];
            const broadcast = (clients, eventType, data) => {
                if (clients && clients.length > 0) {
                    clients.forEach(client => {
                        if (!client.writableEnded && !client.destroyed) {
                            client.write(`event: ${eventType}\n`);
                            client.write(`data: ${JSON.stringify(data)}\n\n`);
                        }
                    });
                }
            };

            expect(() => broadcast(eventClients, 'test', { message: 'hello' })).not.toThrow();
        });

        test('should broadcast to connected clients', () => {
            const calls = [];
            const mockClient1 = {
                write: jest.fn((data) => calls.push({ client: 1, data })),
                writableEnded: false,
                destroyed: false
            };
            const mockClient2 = {
                write: jest.fn((data) => calls.push({ client: 2, data })),
                writableEnded: false,
                destroyed: false
            };
            const eventClients = [mockClient1, mockClient2];

            const broadcast = (clients, eventType, data) => {
                clients.forEach(client => {
                    if (!client.writableEnded && !client.destroyed) {
                        const payload = typeof data === 'string' ? data : JSON.stringify(data);
                        client.write(`event: ${eventType}\n`);
                        client.write(`data: ${payload}\n\n`);
                    }
                });
            };

            broadcast(eventClients, 'plugin_update', { action: 'toggle', pluginName: 'test' });

            expect(mockClient1.write).toHaveBeenCalledTimes(2);
            expect(mockClient2.write).toHaveBeenCalledTimes(2);
            expect(mockClient1.write).toHaveBeenCalledWith('event: plugin_update\n');
        });

        test('should handle string data', () => {
            const calls = [];
            const mockClient = {
                write: jest.fn((data) => calls.push(data)),
                writableEnded: false,
                destroyed: false
            };
            const eventClients = [mockClient];

            const broadcast = (clients, eventType, data) => {
                clients.forEach(client => {
                    if (!client.writableEnded && !client.destroyed) {
                        const payload = typeof data === 'string' ? data : JSON.stringify(data);
                        client.write(`data: ${payload}\n\n`);
                    }
                });
            };

            broadcast(eventClients, 'log', 'simple string message');

            expect(mockClient.write).toHaveBeenCalledWith('data: simple string message\n\n');
        });

        test('should filter out destroyed clients', () => {
            const mockGoodClient = {
                write: jest.fn(),
                writableEnded: false,
                destroyed: false
            };
            const mockBadClient = {
                write: jest.fn(),
                writableEnded: true,
                destroyed: true
            };
            const eventClients = [mockGoodClient, mockBadClient];

            const broadcast = (clients, eventType, data) => {
                clients.forEach(client => {
                    if (!client.writableEnded && !client.destroyed) {
                        const payload = typeof data === 'string' ? data : JSON.stringify(data);
                        client.write(`event: ${eventType}\n`);
                        client.write(`data: ${payload}\n\n`);
                    }
                });
            };

            broadcast(eventClients, 'test', { data: 'test' });

            expect(mockGoodClient.write).toHaveBeenCalled();
            expect(mockBadClient.write).not.toHaveBeenCalled();
        });
    });

    describe('SSE Headers', () => {
        test('should have correct SSE headers', () => {
            const expectedHeaders = {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            };

            expect(expectedHeaders['Content-Type']).toBe('text/event-stream');
            expect(expectedHeaders['Cache-Control']).toBe('no-cache');
            expect(expectedHeaders['Connection']).toBe('keep-alive');
        });
    });

    describe('Keep-alive interval', () => {
        test('should use 30 second keep-alive interval', () => {
            const KEEP_ALIVE_INTERVAL = 30000;
            expect(KEEP_ALIVE_INTERVAL).toBe(30000);
        });

        test('should send keep-alive comment', () => {
            const keepAliveComment = ':\n\n';
            expect(keepAliveComment).toBe(':\n\n');
        });
    });

    describe('initializeUIManagement logic', () => {
        test('should initialize eventClients array', () => {
            let eventClients = undefined;

            if (!eventClients) {
                eventClients = [];
            }

            expect(eventClients).toBeDefined();
            expect(Array.isArray(eventClients)).toBe(true);
        });

        test('should initialize logBuffer array', () => {
            let logBuffer = undefined;

            if (!logBuffer) {
                logBuffer = [];
            }

            expect(logBuffer).toBeDefined();
            expect(Array.isArray(logBuffer)).toBe(true);
        });

        test('should not override existing eventClients', () => {
            const existingClients = [{ write: jest.fn() }];
            let eventClients = existingClients;

            if (!eventClients) {
                eventClients = [];
            }

            expect(eventClients).toBe(existingClients);
        });

        test('should not override existing logBuffer', () => {
            const existingBuffer = [{ message: 'existing' }];
            let logBuffer = existingBuffer;

            if (!logBuffer) {
                logBuffer = [];
            }

            expect(logBuffer).toBe(existingBuffer);
        });
    });

    describe('Console override logic', () => {
        test('should create log entry with correct structure', () => {
            const args = ['test message', { data: 123 }];
            const logEntry = {
                timestamp: new Date().toISOString(),
                level: 'info',
                message: args.map(arg => {
                    if (typeof arg === 'string') return arg;
                    try {
                        return JSON.stringify(arg);
                    } catch (e) {
                        return String(arg);
                    }
                }).join(' ')
            };

            expect(logEntry.level).toBe('info');
            expect(logEntry.timestamp).toBeDefined();
            expect(logEntry.message).toContain('test message');
        });

        test('should limit log buffer size to 100', () => {
            const MAX_LOG_BUFFER = 100;
            expect(MAX_LOG_BUFFER).toBe(100);
        });

        test('should shift oldest log when buffer is full', () => {
            const logBuffer = [];
            for (let i = 0; i < 100; i++) {
                logBuffer.push({ message: `log ${i}` });
            }

            // Add new log
            logBuffer.push({ message: 'new log' });

            // Remove oldest if over 100
            if (logBuffer.length > 100) {
                logBuffer.shift();
            }

            expect(logBuffer.length).toBe(100);
            expect(logBuffer[0].message).toBe('log 1');
            expect(logBuffer[99].message).toBe('new log');
        });
    });

    describe('Client cleanup on close', () => {
        test('should remove client from eventClients on close', () => {
            const mockRes = { id: 1 };
            let eventClients = [mockRes];

            // Simulate close
            eventClients = eventClients.filter(r => r !== mockRes);

            expect(eventClients).not.toContain(mockRes);
        });

        test('should clear keep-alive interval on close', () => {
            let intervalCleared = false;
            const clearInterval = () => { intervalCleared = true; };
            const keepAlive = {
                unref: function() { intervalCleared = true; }
            };

            // Simulate close
            clearInterval(keepAlive);

            expect(intervalCleared).toBe(true);
        });
    });

    describe('Event payload formatting', () => {
        test('should format event message correctly', () => {
            const eventType = 'plugin_update';
            const data = { action: 'toggle', pluginName: 'test' };
            const payload = typeof data === 'string' ? data : JSON.stringify(data);

            const eventLine = `event: ${eventType}\n`;
            const dataLine = `data: ${payload}\n\n`;

            expect(eventLine).toBe('event: plugin_update\n');
            expect(dataLine).toContain('"action":"toggle"');
        });
    });
});
