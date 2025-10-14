// ==========================================
// СИСТЕМА ЖИВЫХ ТОРГОВЫХ СИГНАЛОВ
// Интеграция с Binance API + Ваши стратегии
// ==========================================

class LiveSignalSystem {
    constructor() {
        this.ws = null;
        this.currentSymbol = 'BTCUSDT';
        this.candles = [];
        this.interval = '15m'; // 15 минут по умолчанию
        this.strategies = {
            TREND: new LiveTRENDStrategy(),
            trendline: new LiveTrendlineStrategy(),
            channel: new LiveChannelStrategy()
        };
        this.lastSignals = {};
        this.isAnalyzing = false;
        this.signalHistory = [];
    }

    // Инициализация системы
    async initialize() {
        console.log('🚀 Запуск системы Live сигналов...');
        
        // Загружаем историю из localStorage
        this.loadHistory();
        
        // Загружаем исторические данные
        await this.loadHistoricalData();
        
        // Подключаемся к WebSocket для реал-тайм обновлений
        this.connectWebSocket();
        
        // Запускаем периодический анализ
        this.startAnalysisLoop();
        
        // Показываем историю сигналов
        this.updateSignalHistoryUI();
        
        console.log('✅ Система Live сигналов запущена!');
    }

    // Загрузка исторических данных с Binance
    async loadHistoricalData(symbol = this.currentSymbol, limit = 500) {
        try {
            const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${this.interval}&limit=${limit}`;
            const response = await fetch(url);
            const data = await response.json();
            
            this.candles = data.map(kline => ({
                time: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5])
            }));

            console.log(`📊 Загружено ${this.candles.length} свечей для ${symbol}`);
            
            // Сразу анализируем после загрузки
            this.analyzeAllStrategies();
            
            return this.candles;
        } catch (error) {
            console.error('❌ Ошибка загрузки данных:', error);
            return [];
        }
    }

    // Подключение к WebSocket Binance для реал-тайм данных
    connectWebSocket() {
        if (this.ws) this.ws.close();

        const stream = `${this.currentSymbol.toLowerCase()}@kline_${this.interval}`;
        const wsUrl = `wss://stream.binance.com:9443/ws/${stream}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('🔌 WebSocket подключен к Binance');
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.k) {
                    this.updateCandle(data.k);
                }
            } catch (error) {
                console.error('❌ Ошибка обработки WebSocket:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('🔌 WebSocket отключен, переподключение через 5 сек...');
            setTimeout(() => this.connectWebSocket(), 5000);
        };

        this.ws.onerror = (error) => {
            console.error('❌ WebSocket ошибка:', error);
        };
    }

    // Обновление свечи из WebSocket
    updateCandle(klineData) {
        const newCandle = {
            time: klineData.t,
            open: parseFloat(klineData.o),
            high: parseFloat(klineData.h),
            low: parseFloat(klineData.l),
            close: parseFloat(klineData.c),
            volume: parseFloat(klineData.v)
        };

        // Если свеча закрылась - добавляем новую
        if (klineData.x) {
            this.candles.push(newCandle);
            // Оставляем только последние 500 свечей
            if (this.candles.length > 500) {
                this.candles.shift();
            }
            console.log('🕯️ Новая свеча закрылась, запуск анализа...');
            this.analyzeAllStrategies();
        } else {
            // Обновляем текущую свечу
            if (this.candles.length > 0) {
                this.candles[this.candles.length - 1] = newCandle;
            }
        }
    }

    // Периодический анализ (каждые 15 секунд)
    startAnalysisLoop() {
        setInterval(() => {
            if (!this.isAnalyzing && this.candles.length > 0) {
                this.analyzeAllStrategies();
            }
        }, 15000); // 15 секунд
    }

    // Анализ всех стратегий
    analyzeAllStrategies() {
        if (this.isAnalyzing || this.candles.length < 50) return;
        
        this.isAnalyzing = true;
        
        try {
            // Находим swing точки для стратегий trendline и channel
            const swingPoints = this.findSwingPoints(this.candles);
            
            // Анализируем каждую стратегию
            const signals = {
                TREND: this.strategies.TREND.analyze(this.candles),
                trendline: this.strategies.trendline.analyze(this.candles, swingPoints),
                channel: this.strategies.channel.analyze(this.candles, swingPoints)
            };

            console.log('📊 Результаты анализа всех стратегий:', signals);

            // Обрабатываем каждую стратегию отдельно
            Object.entries(signals).forEach(([strategyName, signal]) => {
                if (!signal || !signal.signal) return;

                // Добавляем метаданные
                const fullSignal = {
                    ...signal,
                    strategy: strategyName,
                    symbol: this.currentSymbol,
                    timestamp: Date.now()
                };

                // Обновляем UI для этой стратегии
                this.updateStrategySignal(fullSignal);

                // Если это новый сигнал - отправляем уведомление
                if (this.isNewSignal(strategyName, signal)) {
                    this.sendNotification(fullSignal);
                }

                // Сохраняем последний сигнал для этой стратегии
                this.lastSignals[strategyName] = signal;
            });

            // Выбираем лучший сигнал для главного дисплея
            const bestSignal = this.selectBestSignal(signals);
            if (bestSignal) {
                this.updateLiveSignalUI(bestSignal);
            }
            
        } catch (error) {
            console.error('❌ Ошибка анализа:', error);
        } finally {
            this.isAnalyzing = false;
        }
    }

    // Обновление сигнала для конкретной стратегии
    updateStrategySignal(signal) {
        // ✅ Сохраняем сигнал для конкретной стратегии
        const signalKey = `lastSignal_${signal.strategy}`;
        const signalData = {
            id: Date.now(),
            symbol: signal.symbol,
            strategy: signal.strategy,
            signal: signal.signal,
            reason: signal.reason || '',
            price: signal.price,
            confidence: signal.confidence || 0,
            time: new Date().toLocaleTimeString('ru-RU'),
            timestamp: signal.timestamp
        };

        localStorage.setItem(signalKey, JSON.stringify(signalData));
        console.log(`💾 Сохранён сигнал для ${signal.strategy}:`, signalData);

        // Если открыта страница этой стратегии - обновляем UI
        if (window.currentStrategyType === signal.strategy) {
            window.dispatchEvent(new CustomEvent('signalUpdated', { 
                detail: signalData 
            }));
        }
    }

    // Поиск swing точек
    findSwingPoints(candles, lookback = 3) {
        const swings = [];
        
        for (let i = lookback; i < candles.length - lookback; i++) {
            let isHigh = true, isLow = true;
            
            for (let j = i - lookback; j <= i + lookback; j++) {
                if (j === i) continue;
                if (candles[j].high >= candles[i].high) isHigh = false;
                if (candles[j].low <= candles[i].low) isLow = false;
            }
            
            if (isHigh) swings.push({ index: i, price: candles[i].high, type: 'high', time: candles[i].time });
            if (isLow) swings.push({ index: i, price: candles[i].low, type: 'low', time: candles[i].time });
        }
        
        return swings;
    }

    // Выбор лучшего сигнала
    selectBestSignal(signals) {
        let bestSignal = null;
        let maxConfidence = 0;

        Object.entries(signals).forEach(([strategy, signal]) => {
            // Приоритет сигналам BUY/SELL/BREAKOUT/BREAKDOWN
            const priority = ['BUY', 'SELL', 'BREAKOUT', 'BREAKDOWN', 'TOUCH'].includes(signal.signal);
            const confidence = signal.confidence || 0;
            
            if (priority && confidence > maxConfidence) {
                maxConfidence = confidence;
                bestSignal = {
                    ...signal,
                    strategy: strategy,
                    symbol: this.currentSymbol
                };
            }
        });

        return bestSignal || {
            signal: 'NEUTRAL',
            reason: 'Нет явных торговых возможностей',
            strategy: 'COMBINED',
            symbol: this.currentSymbol,
            price: this.candles[this.candles.length - 1].close,
            confidence: 30
        };
    }

    // Проверка на новый сигнал
    isNewSignal(strategyName, signal) {
        const lastSignal = this.lastSignals[strategyName];
        if (!lastSignal) return true;
        
        return lastSignal.signal !== signal.signal;
    }

    // Добавление сигнала в историю
    addToHistory(signal) {
        const historyItem = {
            ...signal,
            timestamp: Date.now(),
            id: Date.now()
        };

        this.signalHistory.unshift(historyItem);
        
        // Оставляем только последние 10
        if (this.signalHistory.length > 10) {
            this.signalHistory = this.signalHistory.slice(0, 10);
        }

        // Сохраняем в localStorage
        localStorage.setItem('signalHistory', JSON.stringify(this.signalHistory));
    }

    // Загрузка истории из localStorage
    loadHistory() {
        const saved = localStorage.getItem('signalHistory');
        if (saved) {
            try {
                this.signalHistory = JSON.parse(saved);
            } catch (e) {
                this.signalHistory = [];
            }
        }
    }

    // Обновление UI истории сигналов
    updateSignalHistoryUI() {
        const historyContainer = document.getElementById('signalHistoryContainer');
        if (!historyContainer) return;

        if (this.signalHistory.length === 0) {
            historyContainer.innerHTML = `
                <div style="text-align:center; padding:20px; color:#888;">
                    📊 История сигналов пуста
                </div>
            `;
            return;
        }

        const signalColors = {
            'BUY': '#00ff9f',
            'SELL': '#ff4d4d',
            'BREAKOUT': '#00d4ff',
            'BREAKDOWN': '#ff8800',
            'TOUCH': '#ffaa00',
            'NEUTRAL': '#888888',
            'HOLD': '#9966ff'
        };

        const signalEmojis = {
            'BUY': '📈',
            'SELL': '📉',
            'BREAKOUT': '🚀',
            'BREAKDOWN': '⬇️',
            'TOUCH': '👆',
            'NEUTRAL': '⚖️',
            'HOLD': '⏸️'
        };

        let html = '<div style="display:flex; flex-direction:column; gap:8px;">';

        this.signalHistory.forEach((item, index) => {
            const color = signalColors[item.signal] || '#888888';
            const emoji = signalEmojis[item.signal] || '📊';
            const time = new Date(item.timestamp).toLocaleTimeString('ru-RU');
            const date = new Date(item.timestamp).toLocaleDateString('ru-RU');
            const price = item.price ? '$' + item.price.toFixed(2) : 'N/A';

            html += `
                <div style="background:rgba(255,255,255,0.05); border-left:4px solid ${color}; 
                            border-radius:8px; padding:10px; transition:all 0.2s;
                            cursor:pointer;" 
                     onmouseover="this.style.background='rgba(255,255,255,0.08)'"
                     onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="color:${color}; font-weight:700; font-size:14px;">
                                ${emoji} ${item.signal}
                            </span>
                            <span style="color:#888; font-size:12px; margin-left:8px;">
                                ${item.strategy.toUpperCase()}
                            </span>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:12px; color:#4facfe;">${price}</div>
                            <div style="font-size:10px; color:#888;">${time}</div>
                        </div>
                    </div>
                    <div style="margin-top:5px; font-size:11px; color:#aaa;">
                        ${item.symbol} • ${item.confidence}% • ${item.reason}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        historyContainer.innerHTML = html;
    }

    // Рисуем мини-график (SVG)
    drawMiniChart(signal) {
        // Берём последние 50 свечей для отображения
        const displayCandles = this.candles.slice(-50);
        if (displayCandles.length < 2) {
            return '<div style="text-align:center; color:#888;">Недостаточно данных</div>';
        }

        const width = 350;
        const height = 120;
        const padding = { top: 10, right: 10, bottom: 10, left: 10 };
        
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // Находим min/max цен
        const prices = displayCandles.map(c => [c.high, c.low]).flat();
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice || 1;

        // Функция для преобразования индекса свечи в X координату
        const toX = (index) => {
            return padding.left + (index / (displayCandles.length - 1)) * chartWidth;
        };

        // Функция для преобразования цены в Y координату
        const toY = (price) => {
            return padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
        };

        // Рисуем свечи
        let candlesSVG = '';
        const candleWidth = Math.max(2, chartWidth / displayCandles.length * 0.7);

        displayCandles.forEach((candle, i) => {
            const x = toX(i);
            const openY = toY(candle.open);
            const closeY = toY(candle.close);
            const highY = toY(candle.high);
            const lowY = toY(candle.low);

            const isGreen = candle.close >= candle.open;
            const color = isGreen ? '#26a69a' : '#ef5350';

            // Фитиль
            candlesSVG += `
                <line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" 
                      stroke="${color}" stroke-width="1"/>
            `;

            // Тело свечи
            const bodyHeight = Math.max(1, Math.abs(closeY - openY));
            candlesSVG += `
                <rect x="${x - candleWidth / 2}" y="${Math.min(openY, closeY)}" 
                      width="${candleWidth}" height="${bodyHeight}" 
                      fill="${color}"/>
            `;
        });

        // Линия текущей цены
        const currentPriceY = toY(signal.price);
        const signalColors = {
            'BUY': '#00ff9f',
            'SELL': '#ff4d4d',
            'BREAKOUT': '#00d4ff',
            'BREAKDOWN': '#ff8800',
            'TOUCH': '#ffaa00',
            'NEUTRAL': '#888888',
            'HOLD': '#9966ff'
        };
        const currentColor = signalColors[signal.signal] || '#888888';

        return `
            <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" 
                 style="background:rgba(10,14,39,0.5); border-radius:8px;">
                
                <!-- Сетка -->
                <line x1="${padding.left}" y1="${padding.top}" 
                      x2="${padding.left}" y2="${height - padding.bottom}" 
                      stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
                <line x1="${padding.left}" y1="${height - padding.bottom}" 
                      x2="${width - padding.right}" y2="${height - padding.bottom}" 
                      stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
                
                <!-- Свечи -->
                ${candlesSVG}
                
                <!-- Линия текущей цены -->
                <line x1="${padding.left}" y1="${currentPriceY}" 
                      x2="${width - padding.right}" y2="${currentPriceY}" 
                      stroke="${currentColor}" stroke-width="2" stroke-dasharray="5,5" opacity="0.8"/>
                
                <!-- Метка цены -->
                <text x="${width - padding.right - 5}" y="${currentPriceY - 5}" 
                      fill="${currentColor}" font-size="10" text-anchor="end" font-weight="bold">
                    $${signal.price.toFixed(2)}
                </text>
            </svg>
        `;
    }

    // Обновление UI с живым сигналом
    updateLiveSignalUI(signal) {
        const card = document.getElementById("signalCard");
        if (!card) return;

        // Добавляем сигнал в историю
        this.addToHistory(signal);

        const logos = {
            BTCUSDT: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
            ETHUSDT: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
            BNBUSDT: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
            SOLUSDT: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
            XRPUSDT: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
            ADAUSDT: "https://assets.coingecko.com/coins/images/975/large/cardano.png"
        };

        const signalColors = {
            'BUY': '#00ff9f',
            'SELL': '#ff4d4d',
            'BREAKOUT': '#00d4ff',
            'BREAKDOWN': '#ff8800',
            'TOUCH': '#ffaa00',
            'NEUTRAL': '#888888',
            'HOLD': '#9966ff'
        };

        const signalEmojis = {
            'BUY': '📈',
            'SELL': '📉',
            'BREAKOUT': '🚀',
            'BREAKDOWN': '⬇️',
            'TOUCH': '👆',
            'NEUTRAL': '⚖️',
            'HOLD': '⏸️'
        };

        const color = signalColors[signal.signal] || '#888888';
        const emoji = signalEmojis[signal.signal] || '📊';
        const logo = logos[signal.symbol] || logos.BTCUSDT;

        const price = signal.price ? signal.price.toFixed(2) : 'N/A';
        const confidence = signal.confidence || 0;
        const time = new Date().toLocaleTimeString('ru-RU');

        // Рисуем мини-график
        const chartSVG = this.drawMiniChart(signal);

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:10px; animation: fadeIn 0.5s;">
                <img src="${logo}" alt="${signal.symbol}" 
                     style="width:70px; height:70px; border-radius:50%; 
                            box-shadow:0 0 20px ${color}; transition: all 0.3s;">
                
                <div style="text-align:center;">
                    <h3 style="color:${color}; margin:5px 0; font-size:20px; font-weight:700;">
                        ${emoji} ${signal.signal}
                    </h3>
                    <p style="margin:3px 0; font-size:13px; opacity:0.8;">
                        Стратегия: <b>${signal.strategy.toUpperCase()}</b>
                    </p>
                </div>

                <!-- МИНИ-ГРАФИК -->
                <div style="background:rgba(0,0,0,0.3); border-radius:10px; padding:10px; width:100%; margin:5px 0;">
                    <p style="margin:0 0 8px 0; font-size:12px; opacity:0.7; text-align:center;">
                        📊 График последних 50 свечей
                    </p>
                    ${chartSVG}
                </div>

                <div style="background:rgba(255,255,255,0.05); border-radius:10px; padding:12px; width:100%;">
                    <p style="margin:5px 0; font-size:14px;">
                        💰 Монета: <b>${signal.symbol}</b>
                    </p>
                    <p style="margin:5px 0; font-size:14px;">
                        💵 Цена: <b>$${price}</b>
                    </p>
                    <p style="margin:5px 0; font-size:14px;">
                        🎯 Уверенность: <b>${confidence}%</b>
                    </p>
                    <p style="margin:5px 0; font-size:14px;">
                        🕐 Время: <b>${time}</b>
                    </p>
                </div>

                <p style="font-size:13px; opacity:0.9; text-align:center; line-height:1.5;">
                    ${signal.reason}
                </p>

                <div style="width:100%; height:3px; background:${color}; border-radius:2px; opacity:0.5;"></div>
            </div>
        `;

        // Обновляем историю сигналов
        this.updateSignalHistoryUI();

        // ✅ Сохраняем последний сигнал для стратегий
        localStorage.setItem('lastLiveSignal', JSON.stringify({
            id: Date.now(),
            symbol: signal.symbol,
            strategy: signal.strategy || window.currentStrategyType || 'trend',
            signal: signal.signal,
            reason: signal.reason || '',
            price: signal.price,
            confidence: signal.confidence || 0,
            time: time
        }));

        // 💫 Анимация появления карточки
        card.style.animation = 'pulse 0.5s ease-in-out';
        setTimeout(() => {
            card.style.animation = '';
        }, 500);
    }

    // 📢 Отправка уведомления
    sendNotification(signal) {
        if (window.notificationManager) {
            window.notificationManager.showNotification({
                id: Date.now(),
                symbol: signal.symbol,
                signal: signal.signal,
                strategy: signal.strategy,
                reason: signal.reason,
                price: signal.price,
                confidence: signal.confidence
            });
        }

        console.log("📢 Новый сигнал:", signal);

        // ✅ Обновляем интерфейс и сохраняем сигнал
        this.updateStrategySignal(signal);

        // 🔄 Мгновенно обновляем карточку в открытой стратегии
        if (typeof injectLatestSignalIntoStrategy === 'function') {
            injectLatestSignalIntoStrategy();
        }
    }

    // Смена символа
    changeSymbol(symbol) {
        this.currentSymbol = symbol;
        this.candles = [];
        this.lastSignals = {};
        
        // Закрываем старый WebSocket
        if (this.ws) this.ws.close();
        
        // Загружаем данные для нового символа
        this.loadHistoricalData(symbol).then(() => {
            this.connectWebSocket();
        });
    }

    // Смена таймфрейма
    changeInterval(interval) {
        this.interval = interval;
        this.candles = [];
        this.lastSignals = {};
        
        if (this.ws) this.ws.close();
        
        this.loadHistoricalData(this.currentSymbol).then(() => {
            this.connectWebSocket();
        });
    }
}

// ==========================================
// СТРАТЕГИИ (используем ваши существующие)
// ==========================================

class LiveTRENDStrategy {
    constructor() {
        this.name = 'TREND';
        this.period = 14;
    }

    analyze(candles) {
        if (candles.length < this.period + 3) {
            return { signal: 'WAIT', reason: 'Недостаточно данных', confidence: 0 };
        }

        // Вычисляем MA
        const ma = [];
        for (let i = this.period - 1; i < candles.length; i++) {
            let sum = 0;
            for (let j = i - this.period + 1; j <= i; j++) {
                sum += candles[j].close;
            }
            ma.push(sum / this.period);
        }

        const last3 = candles.slice(-3);
        const allAbove = last3.every((c, i) => c.close > ma[ma.length - 3 + i]);
        const allBelow = last3.every((c, i) => c.close < ma[ma.length - 3 + i]);

        const price = candles[candles.length - 1].close;

        if (allAbove) {
            return {
                signal: 'BUY',
                reason: '3 свечи подряд закрылись выше TREND',
                price: price,
                confidence: 85
            };
        } else if (allBelow) {
            return {
                signal: 'SELL',
                reason: '3 свечи подряд закрылись ниже TREND',
                price: price,
                confidence: 85
            };
        }

        return {
            signal: 'NEUTRAL',
            reason: 'Нет подтверждения направления тренда',
            price: price,
            confidence: 40
        };
    }
}

class LiveTrendlineStrategy {
    constructor() {
        this.name = 'Trendline';
    }

    analyze(candles, swingPoints) {
        if (!swingPoints || swingPoints.length < 4) {
            return { signal: 'WAIT', reason: 'Недостаточно swing точек', confidence: 0 };
        }

        // Ищем восходящий паттерн
        const pattern = this.findAscendingPattern(swingPoints);
        if (!pattern) {
            return { signal: 'NEUTRAL', reason: 'Паттерн не обнаружен', confidence: 20 };
        }

        const currentPrice = candles[candles.length - 1].close;
        const currentTime = candles[candles.length - 1].time;
        
        const p2 = pattern.point2;
        const p4 = pattern.point4;
        const slope = (p4.price - p2.price) / (p4.time - p2.time);
        const trendlinePrice = p4.price + slope * (currentTime - p4.time);
        
        const distance = Math.abs(currentPrice - trendlinePrice) / trendlinePrice * 100;

        if (distance < 0.5) {
            return {
                signal: 'TOUCH',
                reason: 'Касание восходящей трендовой линии',
                price: currentPrice,
                confidence: 75
            };
        } else if (currentPrice < trendlinePrice * 0.995) {
            return {
                signal: 'BREAKDOWN',
                reason: 'Пробой трендовой линии вниз',
                price: currentPrice,
                confidence: 80
            };
        }

        return {
            signal: 'HOLD',
            reason: 'Цена выше трендовой линии',
            price: currentPrice,confidence: 60
        };
    }

    findAscendingPattern(swings) {
        for (let i = swings.length - 1; i >= 3; i--) {
            if (swings[i].type !== 'low') continue;
            for (let j = i - 1; j >= 2; j--) {
                if (swings[j].type !== 'high') continue;
                for (let k = j - 1; k >= 1; k--) {
                    if (swings[k].type !== 'low') continue;
                    for (let l = k - 1; l >= 0; l--) {
                        if (swings[l].type !== 'high') continue;
                        if (swings[j].price > swings[l].price) {
                            return {
                                point1: swings[l],
                                point2: swings[k],
                                point3: swings[j],
                                point4: swings[i]
                            };
                        }
                    }
                }
            }
        }
        return null;
    }
}

class LiveChannelStrategy {
    constructor() {
        this.name = 'Channel';
    }

    analyze(candles, swingPoints) {
        if (!swingPoints || swingPoints.length < 3) {
            return { signal: 'WAIT', reason: 'Недостаточно точек для канала', confidence: 0 };
        }

        const channel = this.findAscendingChannel(swingPoints);
        if (!channel) {
            return { signal: 'NEUTRAL', reason: 'Канал не обнаружен', confidence: 30 };
        }

        const currentPrice = candles[candles.length - 1].close;
        const currentTime = candles[candles.length - 1].time;
        
        const slope = (channel.point3.price - channel.point1.price) / 
                     (channel.point3.time - channel.point1.time);
        
        const upper = channel.point3.price + slope * (currentTime - channel.point3.time);
        const mainAtLow = channel.point1.price + slope * (channel.point2.time - channel.point1.time);
        const offset = channel.point2.price - mainAtLow;
        const lower = upper + offset;
        
        const position = (currentPrice - lower) / (upper - lower);

        if (position >= 0.9) {
            return {
                signal: 'SELL',
                reason: 'Цена у верхней границы канала',
                price: currentPrice,
                confidence: 70
            };
        } else if (position <= 0.1) {
            return {
                signal: 'BUY',
                reason: 'Цена у нижней границы канала',
                price: currentPrice,
                confidence: 70
            };
        } else if (currentPrice > upper) {
            return {
                signal: 'BREAKOUT',
                reason: 'Пробой верхней границы канала вверх',
                price: currentPrice,
                confidence: 85
            };
        } else if (currentPrice < lower) {
            return {
                signal: 'BREAKDOWN',
                reason: 'Пробой нижней границы канала вниз',
                price: currentPrice,
                confidence: 85
            };
        }

        return {
            signal: 'HOLD',
            reason: 'Цена в середине канала',
            price: currentPrice,
            confidence: 50
        };
    }

    findAscendingChannel(swings) {
        for (let i = swings.length - 1; i >= 2; i--) {
            if (swings[i].type !== 'high') continue;
            for (let j = i - 1; j >= 1; j--) {
                if (swings[j].type !== 'low') continue;
                for (let k = j - 1; k >= 0; k--) {
                    if (swings[k].type !== 'high') continue;
                    if (swings[i].price > swings[k].price) {
                        return {
                            point1: swings[k],
                            point2: swings[j],
                            point3: swings[i]
                        };
                    }
                }
            }
        }
        return null;
    }
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ
// ==========================================

// Создаём глобальный экземпляр системы
window.liveSignalSystem = new LiveSignalSystem();

// Запускаем при загрузке страницы
window.addEventListener('load', () => {
    // Ждём 2 секунды после загрузки, чтобы всё инициализировалось
    setTimeout(() => {
        window.liveSignalSystem.initialize();
    }, 2000);
});

// Функция для смены символа (вызывается из UI)
window.changeLiveSignalSymbol = function(symbol) {
    window.liveSignalSystem.changeSymbol(symbol);
};

// Функция для смены таймфрейма
window.changeLiveSignalInterval = function(interval) {
    window.liveSignalSystem.changeInterval(interval);
};

// Функция очистки истории
window.clearSignalHistory = function() {
    if (confirm('Вы уверены, что хотите очистить историю сигналов?')) {
        localStorage.removeItem('signalHistory');
        if (window.liveSignalSystem) {
            window.liveSignalSystem.signalHistory = [];
            window.liveSignalSystem.updateSignalHistoryUI();
        }
        
        // Также очищаем сигналы стратегий
        ['TREND', 'trendline', 'channel'].forEach(strategy => {
            localStorage.removeItem(`lastSignal_${strategy}`);
        });
        
        alert('✅ История очищена!');
    }
};

// ✅ ВАЖНО: Слушаем события обновления сигналов
window.addEventListener('signalUpdated', (event) => {
    console.log('🔔 Получено событие signalUpdated:', event.detail);
    
    // Если открыта страница деталей стратегии - обновляем
    if (window.currentPage === 'strategyDetail' && typeof injectLatestSignalIntoStrategy === 'function') {
        injectLatestSignalIntoStrategy();
    }
});

console.log('✅ Система Live сигналов загружена!');