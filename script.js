'use strict';

/* ============================================================
   КОНСТАНТЫ И КЛЮЧИ В localStorage
   ============================================================ */
const STORAGE_KEYS = {
    counter: 'knopka_counter',          // глобальный счётчик нажатий
    blockedAt: 'knopka_blocked_at',     // timestamp нажатия (для 24-часовой блокировки)
    leaderboard: 'knopka_leaderboard'   // массив топ-5 объектов {nick, time, date}
};

// Длительность блокировки — 24 часа в миллисекундах
const BLOCK_DURATION = 24 * 60 * 60 * 1000;

// Базовое значение счётчика (имитация "уже нажали 12 847 человек")
const COUNTER_BASE = 12847;

// Циклические варианты текста и цвета кнопки (меняются каждые 10 нажатий)
const BUTTON_VARIANTS = [
    { text: 'НЕ НАЖИМАТЬ',   color: '#e63946', shadow: 'rgba(230, 57, 70, 0.4)' },
    { text: 'Я СЕРЬЁЗНО',    color: '#f4a261', shadow: 'rgba(244, 162, 97, 0.4)' },
    { text: 'ПРЕДУПРЕЖДАЮ',  color: '#f4d35e', shadow: 'rgba(244, 211, 94, 0.45)' },
    { text: 'НУ ТЫ И БАРАН', color: '#457b9d', shadow: 'rgba(69, 123, 157, 0.4)' }
];

// Списки для генерации забавных никнеймов
const NICK_ADJ  = ['БараБараН', 'Кликер', 'Я Нажал', 'Великий', 'Тихий', 'Безумный', 'Случайный', 'Любопытный', 'Упрямый', 'Грустный'];
const NICK_NOUN = ['Хулиган', 'Гордец', 'Воитель', 'Палец', 'Мышь', 'Енот', 'Хомяк', 'Заяц', 'Ёж', 'Капитан'];

/* ============================================================
   СОСТОЯНИЕ ПРИЛОЖЕНИЯ
   ============================================================ */
const state = {
    pageLoadedAt: Date.now(),  // время загрузки страницы — нужно для расчёта времени до нажатия
    pressed: false,            // была ли кнопка уже нажата в этой сессии
    idleTimer: null,           // таймер бездействия (30 сек)
    isTouchDevice: false       // сенсорный ли это девайс
};

/* ============================================================
   DOM-ССЫЛКИ
   ============================================================ */
const els = {
    body: document.body,
    stage: document.getElementById('stage'),
    button: document.getElementById('button'),
    counter: document.getElementById('counterValue'),
    info: document.getElementById('info'),
    clock: document.getElementById('clock'),
    bigMessage: document.getElementById('bigMessage'),
    blockMessage: document.getElementById('blockMessage'),
    toast: document.getElementById('toast'),
    leaderboardToggle: document.getElementById('leaderboardToggle'),
    leaderboard: document.getElementById('leaderboard'),
    leaderboardClose: document.getElementById('leaderboardClose'),
    leaderboardList: document.getElementById('leaderboardList')
};

/* ============================================================
   УТИЛИТЫ ДЛЯ localStorage (с защитой от исключений)
   ============================================================ */
function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* игнорируем */ }
}

/* ============================================================
   ОПРЕДЕЛЕНИЕ СЕНСОРНОГО УСТРОЙСТВА
   На таких устройствах нет hover, поэтому кнопка не убегает
   ============================================================ */
state.isTouchDevice = (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(hover: none)').matches
);

/* ============================================================
   СЧЁТЧИК НАЖАТИЙ
   ============================================================ */
function getCounter() {
    const stored = parseInt(lsGet(STORAGE_KEYS.counter), 10);
    return Number.isFinite(stored) ? stored : COUNTER_BASE;
}

function setCounter(value) {
    lsSet(STORAGE_KEYS.counter, String(value));
    renderCounter(value);
}

function renderCounter(value) {
    // Форматируем число с пробелами между разрядами: 12 847
    els.counter.textContent = value.toLocaleString('ru-RU').replace(/,/g, ' ');
}

/* ============================================================
   ОБРАТНЫЕ ЧАСЫ В ПРАВОМ ВЕРХНЕМ УГЛУ
   Считаем разницу между 24:00:00 и текущим временем
   ============================================================ */
function updateClock() {
    const now = new Date();
    // секунды, прошедшие с начала суток
    const elapsed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    // секунды, оставшиеся до конца суток
    const remaining = 24 * 3600 - elapsed;
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    const pad = (n) => String(n).padStart(2, '0');
    els.clock.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/* ============================================================
   УБЕГАНИЕ КНОПКИ ОТ КУРСОРА
   Кнопка позиционирована абсолютно через left/top.
   При hover выбираем случайную точку в пределах viewport.
   ============================================================ */
function moveButtonRandomly() {
    if (state.pressed) return;

    const margin = 30;
    const btnRect = els.button.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Доступная область для центра кнопки
    const minX = btnRect.width / 2 + margin;
    const maxX = vw - btnRect.width / 2 - margin;
    const minY = btnRect.height / 2 + margin;
    const maxY = vh - btnRect.height / 2 - margin;

    // Защита от слишком маленьких экранов
    if (maxX <= minX || maxY <= minY) return;

    const newX = Math.random() * (maxX - minX) + minX;
    const newY = Math.random() * (maxY - minY) + minY;

    els.button.style.left = newX + 'px';
    els.button.style.top  = newY + 'px';
}

/* ============================================================
   ЦИКЛИЧЕСКАЯ СМЕНА ТЕКСТА И ЦВЕТА КНОПКИ
   Меняем каждые 10 нажатий (от базового счётчика)
   ============================================================ */
function updateButtonVariant(counterValue) {
    const pressesSinceBase = Math.max(0, counterValue - COUNTER_BASE);
    const variantIndex = Math.floor(pressesSinceBase / 10) % BUTTON_VARIANTS.length;
    const variant = BUTTON_VARIANTS[variantIndex];
    els.button.textContent = variant.text;
    els.button.style.background = variant.color;
    els.button.style.boxShadow = `0 8px 30px ${variant.shadow}`;
}

/* ============================================================
   ГЕНЕРАЦИЯ СЛУЧАЙНОГО НИКНЕЙМА ДЛЯ ЛИДЕРБОРДА
   ============================================================ */
function generateNick() {
    const adj  = NICK_ADJ[Math.floor(Math.random() * NICK_ADJ.length)];
    const noun = NICK_NOUN[Math.floor(Math.random() * NICK_NOUN.length)];
    const num  = Math.floor(Math.random() * 99) + 1;
    return `${adj} ${noun} ${num}`;
}

/* ============================================================
   ЛИДЕРБОРД: ЧТЕНИЕ / ЗАПИСЬ / ОТРИСОВКА
   Сохраняется как JSON-массив. Сортируется по возрастанию времени.
   ============================================================ */
function getLeaderboard() {
    try {
        const raw = lsGet(STORAGE_KEYS.leaderboard);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveLeaderboard(arr) {
    lsSet(STORAGE_KEYS.leaderboard, JSON.stringify(arr));
}

function addToLeaderboard(timeMs) {
    const list = getLeaderboard();
    list.push({
        nick: generateNick(),
        time: timeMs,
        date: Date.now()
    });
    // Сортируем по возрастанию времени (быстрее = "нетерпеливее")
    list.sort((a, b) => a.time - b.time);
    // Оставляем только топ-5
    const top = list.slice(0, 5);
    saveLeaderboard(top);
    renderLeaderboard();
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const millis = Math.floor((ms % 1000) / 10);
    if (m > 0) return `${m}м ${String(s).padStart(2, '0')}с`;
    return `${s}.${String(millis).padStart(2, '0')}с`;
}

function renderLeaderboard() {
    const list = getLeaderboard();
    els.leaderboardList.innerHTML = '';
    if (list.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'Пока никто не сломался. Будь первым? Или нет?';
        els.leaderboardList.appendChild(li);
        return;
    }
    list.forEach((entry, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span><span class="rank">#${idx + 1}</span><span class="nick">${escapeHtml(entry.nick)}</span></span>
            <span class="time">${formatDuration(entry.time)}</span>
        `;
        els.leaderboardList.appendChild(li);
    });
}

// Простой helper для защиты от XSS при выводе никнеймов
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ============================================================
   TOAST-УВЕДОМЛЕНИЕ ПРИ БЕЗДЕЙСТВИИ
   ============================================================ */
function showToast(text, duration = 5000) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    setTimeout(() => {
        els.toast.classList.remove('show');
    }, duration);
}

/* ============================================================
   ТАЙМЕР БЕЗДЕЙСТВИЯ (30 СЕКУНД)
   Сбрасывается при движении мыши, нажатии клавиш или касании
   ============================================================ */
function resetIdleTimer() {
    if (state.pressed) return; // после нажатия таймер не нужен
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
        showToast('Молодец. Ты сильнее других. Но интересно же, что будет? Нажми. Всего один раз. Ну же...', 5000);
    }, 30000);
}

/* ============================================================
   ПЕЧАТЬ ТЕКСТА ПО ОДНОЙ БУКВЕ (для второго сообщения)
   ============================================================ */
function typeMessage(text, intervalMs, onDone) {
    els.bigMessage.textContent = '';
    els.bigMessage.classList.add('show');
    let i = 0;
    const timer = setInterval(() => {
        els.bigMessage.textContent += text[i];
        i++;
        if (i >= text.length) {
            clearInterval(timer);
            if (onDone) onDone();
        }
    }, intervalMs);
}

/* ============================================================
   ОСНОВНОЙ ОБРАБОТЧИК НАЖАТИЯ КНОПКИ
   ============================================================ */
function handlePress() {
    if (state.pressed) return;
    state.pressed = true;

    // 1. Увеличиваем счётчик
    const current = getCounter();
    const next = current + 1;
    setCounter(next);

    // 2. Записываем в лидерборд время с момента загрузки
    const elapsed = Date.now() - state.pageLoadedAt;
    addToLeaderboard(elapsed);

    // 3. Скрываем кнопку (fade out) и подсказку
    els.button.classList.add('fade-out');
    els.info.classList.add('hidden');

    // 4. Останавливаем таймер бездействия
    if (state.idleTimer) clearTimeout(state.idleTimer);

    // 5. Показываем первое сообщение
    setTimeout(() => {
        els.bigMessage.textContent = 'Ты нажал(а). Теперь жди.';
        els.bigMessage.classList.add('show');
    }, 500);

    // 6. Через 2 секунды — второе сообщение по буквам
    setTimeout(() => {
        els.bigMessage.classList.remove('show');
        setTimeout(() => {
            typeMessage('Я... же... предупреждал(а)...', 200);
        }, 600);
    }, 2500);

    // 7. Через 4 секунды после второго — чернеем и блокируем
    //    (2500 на первое + ~5500 на печать = ~8000, ждём ещё 4с)
    const blockTriggerDelay = 2500 + 600 + ('Я... же... предупреждал(а)...'.length * 200) + 4000;
    setTimeout(() => {
        triggerBlackout();
    }, blockTriggerDelay);
}

/* ============================================================
   ЭКРАН БЛОКИРОВКИ
   ============================================================ */
function triggerBlackout() {
    // Сохраняем время блокировки
    const now = Date.now();
    lsSet(STORAGE_KEYS.blockedAt, String(now));

    // Скрываем большое сообщение
    els.bigMessage.classList.remove('show');

    // Чернеем
    els.body.classList.add('blackout');

    // Показываем текст блокировки
    setTimeout(() => {
        showBlockedScreen(now);
    }, 1500);
}

/* ============================================================
   ОТРИСОВКА ЭКРАНА БЛОКИРОВКИ С ТАЙМЕРОМ ОБРАТНОГО ОТСЧЁТА
   Вызывается и при первом срабатывании, и при повторном заходе
   ============================================================ */
let blockTickInterval = null;

function showBlockedScreen(blockedAt) {
    // Прячем все ненужные элементы
    els.info.classList.add('hidden');
    els.button.classList.add('fade-out');
    els.bigMessage.classList.remove('show');
    els.body.classList.add('blackout');

    const pressedDate = new Date(blockedAt);
    const formatDate = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} в ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const renderText = () => {
        const remaining = BLOCK_DURATION - (Date.now() - blockedAt);
        if (remaining <= 0) {
            // Время вышло — разблокируем и перезагружаем
            clearInterval(blockTickInterval);
            try { localStorage.removeItem(STORAGE_KEYS.blockedAt); } catch (e) {}
            location.reload();
            return;
        }
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        const pad = (n) => String(n).padStart(2, '0');

        // Используем разные сообщения для первой блокировки и повторного захода
        const isFreshBlock = (Date.now() - blockedAt) < 5000;
        if (isFreshBlock) {
            els.blockMessage.innerHTML = `
                Сайт заблокирован на 24 часа.<br>
                Приходи завтра. И подумай о своём поведении.
                <span class="block-timer">${pad(h)}:${pad(m)}:${pad(s)}</span>
            `;
        } else {
            els.blockMessage.innerHTML = `
                Ещё рано. Ты нажал(а) ${formatDate(pressedDate)}.<br>
                Осталось:
                <span class="block-timer">${pad(h)}:${pad(m)}:${pad(s)}</span>
            `;
        }
        els.blockMessage.classList.add('show');
    };

    renderText();
    blockTickInterval = setInterval(renderText, 1000);
}

/* ============================================================
   ПРОВЕРКА АКТИВНОЙ БЛОКИРОВКИ ПРИ ЗАГРУЗКЕ
   ============================================================ */
function checkExistingBlock() {
    const blockedAt = parseInt(lsGet(STORAGE_KEYS.blockedAt), 10);
    if (!Number.isFinite(blockedAt)) return false;

    const elapsed = Date.now() - blockedAt;
    if (elapsed >= BLOCK_DURATION) {
        // Срок блокировки истёк — чистим
        try { localStorage.removeItem(STORAGE_KEYS.blockedAt); } catch (e) {}
        return false;
    }
    // Блокировка действует — показываем экран
    state.pressed = true; // защита от любых интеракций
    showBlockedScreen(blockedAt);
    return true;
}

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ
   ============================================================ */
function bindEvents() {
    // --- Hover: кнопка убегает (только не на touch-устройствах) ---
    if (!state.isTouchDevice) {
        els.button.addEventListener('mouseenter', moveButtonRandomly);
        // Дополнительно — при движении курсора рядом с кнопкой
        els.button.addEventListener('mousemove', moveButtonRandomly);
    }

    // --- Клик мышью по кнопке ---
    // На desktop клик почти невозможен из-за убегания,
    // но если каким-то чудом получилось — засчитываем.
    // На touch-устройствах клик работает нормально.
    els.button.addEventListener('click', (e) => {
        e.preventDefault();
        handlePress();
    });

    // --- Секретный способ: нажатие Enter ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !state.pressed) {
            e.preventDefault();
            handlePress();
        }
    });

    // --- Сброс таймера бездействия ---
    ['mousemove', 'keydown', 'touchstart', 'click', 'wheel'].forEach((evt) => {
        document.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    // --- Предупреждение при закрытии вкладки ---
    window.addEventListener('beforeunload', (e) => {
        if (state.pressed) return; // если уже нажал — пусть уходит спокойно
        const message = 'Ты уверен(а), что хочешь уйти? Кнопка останется одна. Ей будет грустно.';
        e.preventDefault();
        e.returnValue = message; // современные браузеры покажут стандартное сообщение
        return message;          // старые браузеры
    });

    // --- Лидерборд: открыть / закрыть ---
    els.leaderboardToggle.addEventListener('click', () => {
        els.leaderboard.classList.add('open');
        els.leaderboard.setAttribute('aria-hidden', 'false');
    });
    els.leaderboardClose.addEventListener('click', () => {
        els.leaderboard.classList.remove('open');
        els.leaderboard.setAttribute('aria-hidden', 'true');
    });

    // --- Ресайз окна: если кнопка ушла за пределы — возвращаем в центр ---
    window.addEventListener('resize', () => {
        if (state.pressed) return;
        const rect = els.button.getBoundingClientRect();
        if (rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
            els.button.style.left = '50%';
            els.button.style.top  = '50%';
        }
    });
}

/* ============================================================
   КОНСОЛЬНОЕ СООБЩЕНИЕ + ASCII-АРТ
   ============================================================ */
function printConsoleMessage() {
    console.log('%cТы потратил 15 минут жизни, чтобы прочитать это. Оно того не стоило.',
        'color: #e63946; font-size: 14px; font-weight: bold;');
    console.log(
`
        ___________________
       /                   \\
      /     НЕ НАЖИМАТЬ     \\
     |                       |
     |        (  ●  )        |
     |                       |
      \\                     /
       \\___________________/
              ||   ||
              ||   ||
             _||___||_
            |_________|
`
    );
    console.log('%cПодсказка: нажми Enter. Но лучше не надо.',
        'color: #888; font-style: italic;');
}

/* ============================================================
   СТАРТ ПРИЛОЖЕНИЯ
   ============================================================ */
function init() {
    printConsoleMessage();

    // Часы стартуем всегда
    updateClock();
    setInterval(updateClock, 1000);

    // Отрисовываем лидерборд
    renderLeaderboard();

    // Если действует блокировка — на этом всё, дальше ничего не нужно
    if (checkExistingBlock()) {
        return;
    }

    // Иначе — обычный режим
    const counterValue = getCounter();
    renderCounter(counterValue);
    updateButtonVariant(counterValue);

    bindEvents();
    resetIdleTimer();
}

// Запускаемся после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
