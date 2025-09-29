// main.js — логика стратегий и canvas-графика

let currentStrategy = null;
let currentSymbol = 'BTCUSDT';
let currentTimeframe = '15m';
let candlesData = [];
let canvas = null;
let ctx = null;

// Настройки графика
const PADDING = { top: 40, right: 100, bottom: 40, left: 10 };

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('chartCanvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
});

// Подгоняем размер
function resizeCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width - 20 || 1180;
    canvas.height = 600;
    if (candlesData.length > 0) drawChart();
}

// Переход к стратегии
function showStrategy(strategy) {
    currentStrategy = strategy;
    document.getElementById('strategiesPage').classList.remove('active');
    document.getElementById('strategyDetail').classList.add('active');

    const titles = {
        ma14: '📗 MA14',
        trendline: '📘 Трендовая линия',
        channel: '📙 Трендовый канал'
    };

    document.getElementById('strategyDetailTitle').textContent = titles[strategy];
    updateChart();
}

// Назад
function goBack() {
    document.getElementById('strategyDetail').classList.remove('active');
    document.getElementById('strategiesPage').classList.add('active');
    currentStrategy = null;
}

// Обновление графика
async function updateChart() {
    if (!currentStrategy) return;

    document.getElementById('strategyDetailContent').innerHTML = `
        <div class="controls">
            <select id="coinSelect" onchange="updateChart()">
                <option value="BTCUSDT">BTC/USDT</option>
                <option value="ETHUSDT">ETH/USDT</option>
                <option value="BNBUSDT">BNB/USDT</option>
                <option value="SOLUSDT">SOL/USDT</option>
                <option value="XRPUSDT">XRP/USDT</option>
                <option value="ADAUSDT">ADA/USDT</option>
            </select>
            <select id="timeframeSelect" onchange="updateChart()">
                <option value="1m">1m</option>
                <option value="5m">5m</option>
                <option value="15m" selected>15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
                <option value="1d">1d</option>
            </select>
        </div>
        <canvas id="chartCanvas"></canvas>
        <div id="signalBox" style="margin-top:10px; font-weight:bold; color:#4facfe;"></div>
    `;

    canvas = document.getElementById('chartCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();

    // Для MA14 фиксируем таймфрейм = D1
    currentSymbol = document.getElementById('coinSelect').value;
    currentTimeframe = document.getElementById('timeframeSelect').value;
    if (currentStrategy === 'ma14') currentTimeframe = '1d';

    // Загружаем свечи
    candlesData = await fetchBinanceData(currentSymbol, currentTimeframe, 100);
    drawChart();

    // Анализ стратегии
    const result = analyzeData(candlesData, currentStrategy);
    document.getElementById('signalBox').textContent = `Сигнал: ${result.signal} (${result.reason})`;
}

// Загрузка данных с Binance
async function fetchBinanceData(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const response = await fetch(url);
        const data = await response.json();

        return data.map(kline => ({
            time: kline[0],
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5])
        }));
    } catch (e) {
        console.error("Ошибка загрузки данных", e);
        return [];
    }
}

// Анализ по стратегии
function analyzeData(candles, strategy) {
    if (strategy === 'ma14') return analyzeMA14(candles);
    if (strategy === 'trendline') return analyzeTrendline(candles);
    if (strategy === 'channel') return analyzeChannel(candles);
    return { signal: 'WAIT', reason: 'Нет стратегии' };
}

// === STRATEGY 1: MA14 ===
function analyzeMA14(candles) {
    if (candles.length < 17) return { signal: 'WAIT', reason: 'Мало данных' };

    const ma = [];
    for (let i = 13; i < candles.length; i++) {
        let sum = 0;
        for (let j = i - 13; j <= i; j++) sum += candles[j].close;
        ma.push(sum / 14);
    }

    const last3 = candles.slice(-3);
    const last3Above = last3.every((c, i) => c.close > ma[ma.length - 3 + i]);
    const last3Below = last3.every((c, i) => c.close < ma[ma.length - 3 + i]);

    if (last3Above) return { signal: 'BUY', reason: '3 свечи выше MA14' };
    if (last3Below) return { signal: 'SELL', reason: '3 свечи ниже MA14' };
    return { signal: 'NEUTRAL', reason: 'Нет сигнала' };
}

// === STRATEGY 2: Trendline (по тройному движению) ===
function analyzeTrendline(candles) {
    if (candles.length < 20) return { signal: 'WAIT', reason: 'Мало данных' };
    // (упрощённая логика для теста)
    return { signal: 'NEUTRAL', reason: 'Тестовая реализация' };
}

// === STRATEGY 3: Channel ===
function analyzeChannel(candles) {
    if (candles.length < 20) return { signal: 'WAIT', reason: 'Мало данных' };
    // (упрощённая логика для теста)
    return { signal: 'NEUTRAL', reason: 'Тестовая реализация' };
}

// Рисуем свечи
function drawChart() {
    if (!ctx || !candlesData.length) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0e27';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const chartWidth = canvas.width - PADDING.left - PADDING.right;
    const chartHeight = canvas.height - PADDING.top - PADDING.bottom;

    const minPrice = Math.min(...candlesData.map(c => c.low));
    const maxPrice = Math.max(...candlesData.map(c => c.high));
    const priceRange = maxPrice - minPrice;

    const toX = (i) => PADDING.left + (i / (candlesData.length - 1)) * chartWidth;
    const toY = (p) => PADDING.top + chartHeight - ((p - minPrice) / priceRange) * chartHeight;

    const candleWidth = Math.max(2, (chartWidth / candlesData.length) * 0.7);

    candlesData.forEach((candle, i) => {
        const x = toX(i);
        const openY = toY(candle.open);
        const closeY = toY(candle.close);
        const highY = toY(candle.high);
        const lowY = toY(candle.low);

        const isGreen = candle.close >= candle.open;
        const color = isGreen ? '#26a69a' : '#ef5350';

        // Тени
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        // Тело
        ctx.fillStyle = color;
        ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, Math.abs(closeY - openY) || 1);
    });

    // Отрисовка стратегий (добавим позже)
}
