'use strict';
//📢📢📢 MegaArchitectBot — Бот-архитектор для управления экосистемой ботов

const lib = process.env.NODE_ENV === 'production'
    ? require('libBotUtiletes')
    : require('../libBotUtilites/libBotUtilitesIndex.js');

const dbConnect = require('./dbconnect.json');

//region ===================== ИНИЦИАЛИЗАЦИЯ =====================

const vBotConfig = {
    glBotUserName: 'megaarchitectbot',
    schema: 'megaarchitect',
    dbConnect: dbConnect,
    onStart: onStart,
    cbLcAddProcessCommand: lcAddProcessCommand,
    cbLcSubstituteVars: lcSubstituteVars,
    cbLcSaveTaskToDb: lcSaveTaskToDb,
    cbLcPrepareQuestionStep: lcPrepareQuestionStep,
    cbLcActBeforeAssign: lcActBeforeAssign,
    cbLcGetFullInfoExtra: lcGetFullInfoExtra,
};

let glArr = lib.libCreateBotInstance(vBotConfig);

//endregion

//region ===================== СТАРТ =====================

async function onStart() {
    try {
        await lib.libInitBot(glArr);
        lcRegisterHandlers();
        await lcRefresh();
        await glArr.glBot.startPolling();
        console.log(`✅ ${glArr.glBotUserName} запущен (${glArr.glIsProd ? 'PROD' : 'TEST'})`);
    } catch (err) {
        console.error('❌ Ошибка запуска:', err);
        process.exit(1);
    }//
}//onStart

async function lcRefresh() {
    await lib.libRefresh(glArr);
    // TODO: Загрузка локальных данных
}//lcRefresh

function lcRegisterHandlers() {
    glArr.glBot.on('message', async (msg) => {
        await lib.libEnqueueMessage(glArr, msg);
    });

    glArr.glBot.on('callback_query', async (cbq) => {
        await lib.libEnqueueMessage(glArr, cbq);
    });

    glArr.glBot.on('polling_error', (err) => {
        console.error('Polling error:', err.message);
    });
}//lcRegisterHandlers

//endregion

//region ===================== ОБРАБОТКА КОМАНД =====================

async function lcAddProcessCommand(glArr, vCmd, vParam, msg) {
    // TODO: Обработка локальных команд
    return false;
}//lcAddProcessCommand

//endregion

//region ===================== ПОДГОТОВКА ШАГОВ =====================

async function lcPrepareQuestionStep(glArr, vTask) {
    // TODO: Динамические кнопки
}//lcPrepareQuestionStep

//endregion

//region ===================== ДЕЙСТВИЯ ПЕРЕД ПРИСВОЕНИЕМ =====================

async function lcActBeforeAssign(glArr, msg, vTask) {
    // TODO: Логика перед присвоением
}//lcActBeforeAssign

//endregion

//region ===================== СОХРАНЕНИЕ В БД =====================

async function lcSaveTaskToDb(glArr, vTask) {
    // TODO: Сохранение результатов задачи
}//lcSaveTaskToDb

//endregion

//region ===================== ПОДСТАНОВКА ПЕРЕМЕННЫХ =====================

async function lcSubstituteVars(glArr, vVariable, vBotUsersId) {
    let vResult = null;

    // Переменная для приветствия /start — разный текст для админа и не-админа
    if (vVariable === 'startwelcome') {
        const vTelegramId = await lib.libGetTelegramIdByBotUsersId(glArr, vBotUsersId);
        const vIsAdmin = glArr.glAdminList.includes(Number(vTelegramId));

        if (vIsAdmin) {
            vResult = `🛠 Добро пожаловать, Повелитель!\n\nДоступные команды:\n/newbot — создать нового бота\n/newcmd — создать команду для бота\n/listbots — список управляемых ботов\n/genprompt — сгенерировать промпт для Claude Code`;
        }//Приветствие для админа
        else {
            vResult = `⚠️ Это служебный бот для администрирования экосистемы ботов.\n\nДоступ ограничен. Для получения доступа обратитесь к @pkondaurov`;
        }//Приветствие для не-админа
    }//startwelcome

    return vResult;
}//lcSubstituteVars

//endregion

//region ===================== ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ =====================

async function lcGetFullInfoExtra(glArr, vBotUsersId) {
    // TODO: Локальная информация для libGetFullInfo
    return null;
}//lcGetFullInfoExtra

//endregion

onStart();
