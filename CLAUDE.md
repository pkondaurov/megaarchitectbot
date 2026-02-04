# MegaArchitectBot — Бот-архитектор для управления экосистемой ботов

Мета-бот для создания новых ботов, команд, сценариев и генерации промптов для Claude Code. Работает поверх библиотеки libBotUtilites и управляет всей инфраструктурой.

---

## ⚠️ КРИТИЧНЫЕ ПРАВИЛА

### MCP-серверы (приоритет!)
- **Для работы с БД** — ВСЕГДА используй `mcp__postgres__query`, НЕ Bash с psql
- **Для работы с сервером** — ВСЕГДА используй `mcp__ssh__exec` или `mcp__ssh__sudo-exec`, НЕ Bash с ssh
- **Для работы с GitHub API** — используй `mcp__github__*` инструменты

### Репозиторий и окружение
- **GitHub:** https://github.com/pkondaurov/megaarchitectbot
- **Библиотека:** @../libBotUtilites/CLAUDE.md
- **Схема библиотеки:** `fbs_technozerg_bot`
- **Схема бота:** `megaarchitectbot`

### Именование
- **Имя бота:** `megaarchitectbot` — критично для `botusername`
- **ВАЖНО: schema = botusername** — схема БД всегда совпадает с именем бота
- **Тестовый бот:** `@forlocaltestbot` (общий для всех проектов)

### Префиксы функций
- `lib*` — функции библиотеки
- `lc*` — локальные функции бота

### Деньги и даты
- **ВСЕ суммы в КОПЕЙКАХ**
- **Всегда `TIMESTAMPTZ`** (с timezone), не `TIMESTAMP`

---

## 🎯 Назначение бота

MegaArchitectBot — это инструмент разработчика для:

### 1. Создание новых ботов
- Регистрация бота в `lib_bots`
- Сбор и сохранение токенов в `lib_bots.secrets`
- Создание схемы БД для бота
- Генерация скелета кода (index.js, package.json, CLAUDE.md)
- Создание репозитория на GitHub
- Настройка деплоя на сервере

### 2. Создание команд для ботов
- Добавление записей в `lib_savescenario` (шаги сценария)
- Добавление кнопок в `lib_scenariobuttons`
- Добавление текстов в `lib_cmdmessages`
- Генерация Claude Code промпта для реализации логики команды

### 3. Генерация тест-планов
- Создание плана тестирования для каждой команды
- Формат для внешнего MTProto-бота-тестировщика
- Проверка всех ветвлений сценария

### 4. Генерация промптов для Claude Code
- Промпт для подстановки динамических кнопок (`lcPrepareQuestionStep`)
- Промпт для валидации (`lcCheckValidField`)
- Промпт для сохранения (`lcSaveTaskToDb`)
- Промпт для действий перед присвоением (`lcActBeforeAssign`)

---

## 🏗️ Архитектура

### Инициализация
```javascript
const lib = process.env.NODE_ENV === 'production'
    ? require('libBotUtiletes')
    : require('../libBotUtilites/libBotUtilitesIndex.js');

const dbConnect = require('./dbconnect.json');

const vBotConfig = {
    glBotUserName: 'megaarchitectbot',
    schema: 'megaarchitect',
    dbConnect: dbConnect,
    // коллбеки...
};

let glArr = lib.libCreateBotInstance(vBotConfig);
```

---

## 📊 База данных (схема: megaarchitect)

### managed_bots — Управляемые боты
```sql
CREATE TABLE megaarchitect.managed_bots (
    id SERIAL PRIMARY KEY,
    botusername VARCHAR(100) NOT NULL UNIQUE,
    lib_bots_id INTEGER REFERENCES fbs_technozerg_bot.lib_bots(id),
    github_repo VARCHAR(200),
    server_path VARCHAR(300),
    pm2_name VARCHAR(100),
    createdat TIMESTAMPTZ DEFAULT now(),
    createdby INTEGER REFERENCES fbs_technozerg_bot.lib_botusers(id)
);
```

### managed_commands — Созданные команды
```sql
CREATE TABLE megaarchitect.managed_commands (
    id SERIAL PRIMARY KEY,
    managed_bots_id INTEGER REFERENCES megaarchitect.managed_bots(id),
    command VARCHAR(50) NOT NULL,
    tasktype VARCHAR(50) NOT NULL,
    description TEXT,
    createdat TIMESTAMPTZ DEFAULT now(),
    createdby INTEGER REFERENCES fbs_technozerg_bot.lib_botusers(id)
);
```

### command_steps — Шаги команд (зеркало lib_savescenario)
```sql
CREATE TABLE megaarchitect.command_steps (
    id SERIAL PRIMARY KEY,
    managed_commands_id INTEGER REFERENCES megaarchitect.managed_commands(id),
    lib_savescenario_id INTEGER REFERENCES fbs_technozerg_bot.lib_savescenario(id),
    stepname VARCHAR(50) NOT NULL,
    ordernumber INTEGER NOT NULL,
    fieldtype VARCHAR(50),
    questiontext TEXT,
    createdat TIMESTAMPTZ DEFAULT now()
);
```

### test_plans — Планы тестирования
```sql
CREATE TABLE megaarchitect.test_plans (
    id SERIAL PRIMARY KEY,
    managed_commands_id INTEGER REFERENCES megaarchitect.managed_commands(id),
    testplan_json JSONB NOT NULL,
    createdat TIMESTAMPTZ DEFAULT now(),
    lastrun TIMESTAMPTZ,
    lastresult VARCHAR(20) -- 'passed', 'failed', 'pending'
);
```

### claude_prompts — Сгенерированные промпты
```sql
CREATE TABLE megaarchitect.claude_prompts (
    id SERIAL PRIMARY KEY,
    managed_commands_id INTEGER REFERENCES megaarchitect.managed_commands(id),
    prompt_type VARCHAR(50) NOT NULL, -- 'prepare_step', 'save_task', 'before_assign', 'full_implementation'
    prompt_text TEXT NOT NULL,
    createdat TIMESTAMPTZ DEFAULT now()
);
```

---

## 📝 Команды бота

### /newbot — Создание нового бота
`taskType: 'createBot'`

Шаги:
1. `botusername` — имя бота (без @)
2. `botdescription` — описание бота
3. `bottoken_prod` — токен продакшн-бота от @BotFather
4. `bottoken_test` — токен тестового бота (опционально, можно использовать общий)
5. `github_create` — создать репозиторий на GitHub? (да/нет)
6. `server_deploy` — настроить деплой на сервере? (да/нет)

Результат:
- Запись в `lib_bots` с токенами в `secrets`
- Схема в PostgreSQL
- Репозиторий на GitHub (опционально)
- Скрипт деплоя на сервере (опционально)
- Сгенерированные файлы: index.js, package.json, CLAUDE.md, .gitignore

### /newcmd — Создание новой команды
`taskType: 'createCommand'`

Шаги:
1. `target_bot` — выбор бота (кнопки из managed_bots)
2. `command_name` — имя команды (без /)
3. `tasktype` — идентификатор типа задачи
4. `command_description` — описание команды
5. `steps_count` — количество шагов
6. Для каждого шага:
   - `step_N_name` — имя шага
   - `step_N_question` — текст вопроса
   - `step_N_fieldtype` — тип поля (кнопки из справочника)
   - `step_N_buttons` — кнопки (если fieldtype=button)

Результат:
- Записи в `lib_savescenario`
- Записи в `lib_scenariobuttons` (если есть кнопки)
- Запись в `lib_cmdmessages` (если одноходовая)
- План тестирования в `test_plans`
- Промпты для Claude Code в `claude_prompts`

### /genprompt — Генерация промпта для существующей команды
`taskType: 'generatePrompt'`

Шаги:
1. `target_bot` — выбор бота
2. `target_command` — выбор команды
3. `prompt_type` — тип промпта (prepare_step, save_task, before_assign, full)

### /testplan — Просмотр/запуск тест-плана
`taskType: 'viewTestPlan'`

Шаги:
1. `target_bot` — выбор бота
2. `target_command` — выбор команды
3. `action` — просмотреть / запустить тест

### /listbots — Список управляемых ботов
Одноходовая команда. Выводит список ботов с кнопками для перехода к командам.

### /listcmds — Список команд бота
`taskType: 'listCommands'`

Шаги:
1. `target_bot` — выбор бота

---

## 🔧 Генерация промптов для Claude Code

### Шаблон промпта для новой команды

```markdown
## Задача: Реализовать команду /{command} для бота {botusername}

### Описание
{description}

### Шаги сценария
{steps_table}

### Что нужно реализовать

1. **lcPrepareQuestionStep** — динамические кнопки для шагов:
{prepare_step_code}

2. **lcActBeforeAssign** — логика перед присвоением:
{before_assign_code}

3. **lcSaveTaskToDb** — сохранение в БД:
{save_task_code}

4. **Таблицы БД** (если нужны новые):
{db_tables}

### Тест-план
{test_plan}
```

### Шаблон тест-плана (JSON)

```json
{
  "command": "/labcheck",
  "tasktype": "labCheck",
  "scenarios": [
    {
      "name": "Успешный путь",
      "steps": [
        {"action": "send", "value": "/labcheck"},
        {"action": "wait", "expect": "contains", "text": "Отправьте фото"},
        {"action": "send_photo", "file": "test_analysis.jpg"},
        {"action": "send", "value": "стопстоп"},
        {"action": "wait", "expect": "buttons", "buttons": ["Мои", "Другого человека"]},
        {"action": "click_button", "text": "Мои"},
        {"action": "wait", "expect": "contains", "text": "Опишите"}
      ]
    },
    {
      "name": "Отмена на первом шаге",
      "steps": [
        {"action": "send", "value": "/labcheck"},
        {"action": "send", "value": "/cancel"},
        {"action": "wait", "expect": "contains", "text": "отменен"}
      ]
    }
  ]
}
```

---

## 🔄 Жизненный цикл создания команды

```
/newcmd
    │
    ├─ Сбор информации о команде
    │
    ├─ Генерация записей в lib_savescenario
    │
    ├─ Генерация записей в lib_scenariobuttons
    │
    ├─ Генерация тест-плана → test_plans
    │
    ├─ Генерация промптов → claude_prompts
    │
    └─ Отправка промпта в чат для копирования в Claude Code
```

---

## 🔧 Локальные функции

| Функция | Описание |
|---------|----------|
| `lcGenerateBotSkeleton` | Генерация файлов нового бота |
| `lcGenerateClaudePrompt` | Генерация промпта для Claude Code |
| `lcGenerateTestPlan` | Генерация тест-плана |
| `lcCreateScenarioSteps` | Создание шагов в lib_savescenario |
| `lcGetManagedBots` | Список управляемых ботов (для кнопок) |
| `lcGetBotCommands` | Список команд бота (для кнопок) |

---

## 🚀 Деплой

### Локальный запуск
```bash
cd /home/pkondaurov/dev/megaarchitectbot
pm2 start megaarchitectbotIndex.js --name megaarchitectbot-test
```

### Обновление на сервере
```bash
ssh notfstrf@84.252.140.239
bash ~/updMegaArchitectBot.sh
```

---

## 🔧 Стиль кода

```javascript
// Комментарии после закрывающих скобок
if (condition) {
    // логика
}//Описание блока

// Эмоджи-маркеры
// ⛔ = return
// 🛑 = continue
// 📢📢📢 = важное место
```

---

## 🚫 Чего НЕ делать

1. **Не хардкодить схему** — всегда `${glArr.glPgLibSchema}.lib_*`
2. **Не создавать lib_-таблицы в схеме бота** — только в `fbs_technozerg_bot`
3. **Не удалять комментарии `}//`** — критичны для навигации
4. **Не использовать TIMESTAMP** — только `TIMESTAMPTZ`
5. **Не использовать Markdown** — всегда HTML-разметка (`<b>`, `<i>`, `<code>`), не передавать `parse_mode`
