require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// -------------------------------------------------------
// Pool de conexão — Aiven MySQL
// -------------------------------------------------------
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 30000,
    queueLimit: 0
});

// -------------------------------------------------------
// Rota raiz — confirma que a API está online
// -------------------------------------------------------
app.get('/', (req, res) => {
    res.json({ ok: true, message: 'API online' });
});


async function initDB() {
    try {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS seguranca`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS seguranca.tbUsuarios (
                usuario_id     INT(10)      NOT NULL AUTO_INCREMENT,
                nome           VARCHAR(200) NOT NULL,
                login          VARCHAR(50)  NOT NULL,
                senha          VARCHAR(255) NOT NULL,
                atualizado_em  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                atualizado_por INT(10)      NULL,
                PRIMARY KEY (usuario_id),
                UNIQUE KEY uq_usuario_login (login),
                CONSTRAINT fk_usuario_atualizado_por
                    FOREIGN KEY (atualizado_por) REFERENCES seguranca.tbUsuarios (usuario_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tbServicoTipo (
                servico_tipo_id INT(10)      NOT NULL AUTO_INCREMENT,
                descricao       VARCHAR(200) NOT NULL,
                PRIMARY KEY (servico_tipo_id),
                UNIQUE KEY uq_servicotipo_descricao (descricao)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tbServicos (
                servico_id      INT(10)       NOT NULL AUTO_INCREMENT,
                descricao       VARCHAR(200)  NOT NULL,
                valor           DECIMAL(19,2) NOT NULL,
                servico_tipo_id INT(10)       NOT NULL,
                atualizado_em   DATETIME      NOT NULL,
                atualizado_por  INT(10)       NULL,
                PRIMARY KEY (servico_id),
                UNIQUE KEY uq_servico_descricao (descricao),
                CONSTRAINT fk_servico_tipo
                    FOREIGN KEY (servico_tipo_id) REFERENCES tbServicoTipo (servico_tipo_id),
                CONSTRAINT fk_servico_atualizado_por
                    FOREIGN KEY (atualizado_por) REFERENCES seguranca.tbUsuarios (usuario_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tbImovelTipo (
                imovel_tipo_id INT(10)      NOT NULL AUTO_INCREMENT,
                descricao      VARCHAR(200) NOT NULL,
                PRIMARY KEY (imovel_tipo_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tbImovel (
                imovel_id       INT(10)       NOT NULL AUTO_INCREMENT,
                endereco        VARCHAR(200)  NOT NULL,
                valor           DECIMAL(19,2) NOT NULL,
                area            DECIMAL(19,2) NOT NULL,
                proprietario_id INT(11)       NOT NULL,
                imovel_tipo_id  INT(10)       NOT NULL,
                atualizado_em   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                atualizado_por  INT(10)       NULL,
                PRIMARY KEY (imovel_id),
                CONSTRAINT fk_imovel_proprietario
                    FOREIGN KEY (proprietario_id) REFERENCES seguranca.tbUsuarios (usuario_id),
                CONSTRAINT fk_imovel_tipo
                    FOREIGN KEY (imovel_tipo_id) REFERENCES tbImovelTipo (imovel_tipo_id),
                CONSTRAINT fk_imovel_atualizado_por
                    FOREIGN KEY (atualizado_por) REFERENCES seguranca.tbUsuarios (usuario_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tbHistorico (
                historico_id   INT(10)       NOT NULL AUTO_INCREMENT,
                data           DATE          NOT NULL,
                laudo          VARCHAR(255)  NULL,
                exame_id       INT(10)       NULL,
                valor          DECIMAL(19,2) NULL,
                atualizado_em  INT(10)       NULL,
                atualizado_por INT(10)       NULL,
                equipamento_id INT(10)       NULL,
                PRIMARY KEY (historico_id),
                CONSTRAINT fk_historico_atualizado_por
                    FOREIGN KEY (atualizado_por) REFERENCES seguranca.tbUsuarios (usuario_id),
                CONSTRAINT fk_historico_exame
                    FOREIGN KEY (exame_id) REFERENCES tbServicos (servico_id),
                CONSTRAINT fk_historico_imovel
                    FOREIGN KEY (historico_id) REFERENCES tbImovel (imovel_id)
            )
        `);

        console.log('Banco inicializado com sucesso.');
    } catch (err) {
        console.error('Erro ao inicializar banco:', err.message);
    }
}

initDB();
// -------------------------------------------------------
// Ping — testa conexão com o banco
// -------------------------------------------------------
app.get('/api/ping', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 as ok');
        res.json({ ok: true, db: rows[0] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// USUÁRIOS — Cadastro
// -------------------------------------------------------
app.post('/api/registrar', async (req, res) => {
    const { nome, login, senha } = req.body;
    if (!nome || !login || !senha)
        return res.status(400).json({ ok: false, error: 'Todos os campos são obrigatórios.' });
    try {
        const [existe] = await pool.query(
            'SELECT usuario_id FROM seguranca.tbUsuarios WHERE login = ?', [login]
        );
        if (existe.length > 0)
            return res.status(409).json({ ok: false, error: 'Login já cadastrado.' });

        const [result] = await pool.query(
            'INSERT INTO seguranca.tbUsuarios (nome, login, senha) VALUES (?, ?, ?)',
            [nome, login, senha]
        );
        res.json({ ok: true, usuario_id: result.insertId, message: 'Usuário criado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// USUÁRIOS — Login
// -------------------------------------------------------
app.post('/api/login', async (req, res) => {
    const { login, senha } = req.body;
    if (!login || !senha)
        return res.status(400).json({ ok: false, error: 'Login e senha são obrigatórios.' });
    try {
        const [rows] = await pool.query(
            'SELECT usuario_id, nome, login FROM seguranca.tbUsuarios WHERE login = ? AND senha = ?',
            [login, senha]
        );
        if (rows.length > 0) {
            res.json({ ok: true, usuario_id: rows[0].usuario_id, nome: rows[0].nome, login: rows[0].login });
        } else {
            res.status(401).json({ ok: false, error: 'Login ou senha incorretos.' });
        }
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// IMÓVEIS — Listar todos
// -------------------------------------------------------
app.get('/api/imoveis', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT i.imovel_id, i.endereco, i.valor, i.area,
                   u.nome AS proprietario, t.descricao AS tipo
            FROM tbImovel i
            JOIN seguranca.tbUsuarios u ON u.usuario_id = i.proprietario_id
            JOIN tbImovelTipo t         ON t.imovel_tipo_id = i.imovel_tipo_id
        `);
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// IMÓVEIS — Buscar por ID
// -------------------------------------------------------
app.get('/api/imoveis/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT i.*, u.nome AS proprietario, t.descricao AS tipo
            FROM tbImovel i
            JOIN seguranca.tbUsuarios u ON u.usuario_id = i.proprietario_id
            JOIN tbImovelTipo t         ON t.imovel_tipo_id = i.imovel_tipo_id
            WHERE i.imovel_id = ?
        `, [req.params.id]);
        if (rows.length === 0)
            return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// IMÓVEIS — Cadastrar
// -------------------------------------------------------
app.post('/api/imoveis', async (req, res) => {
    const { endereco, valor, area, proprietario_id, imovel_tipo_id, atualizado_por } = req.body;
    if (!endereco || !valor || !area || !proprietario_id || !imovel_tipo_id)
        return res.status(400).json({ ok: false, error: 'Campos obrigatórios faltando.' });
    try {
        const [result] = await pool.query(
            `INSERT INTO tbImovel (endereco, valor, area, proprietario_id, imovel_tipo_id, atualizado_por)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [endereco, valor, area, proprietario_id, imovel_tipo_id, atualizado_por || null]
        );
        res.json({ ok: true, imovel_id: result.insertId, message: 'Imóvel cadastrado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// IMÓVEIS — Atualizar
// -------------------------------------------------------
app.put('/api/imoveis/:id', async (req, res) => {
    const { endereco, valor, area, proprietario_id, imovel_tipo_id, atualizado_por } = req.body;
    try {
        await pool.query(
            `UPDATE tbImovel SET endereco=?, valor=?, area=?, proprietario_id=?,
             imovel_tipo_id=?, atualizado_por=? WHERE imovel_id=?`,
            [endereco, valor, area, proprietario_id, imovel_tipo_id, atualizado_por || null, req.params.id]
        );
        res.json({ ok: true, message: 'Imóvel atualizado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// IMÓVEIS — Deletar
// -------------------------------------------------------
app.delete('/api/imoveis/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM tbImovel WHERE imovel_id = ?', [req.params.id]);
        res.json({ ok: true, message: 'Imóvel removido com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// HISTÓRICO — Listar
// -------------------------------------------------------
app.get('/api/historico/:imovel_id', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT h.*, s.descricao AS servico
            FROM tbHistorico h
            LEFT JOIN tbServicos s ON s.servico_id = h.exame_id
            WHERE h.historico_id = ?
        `, [req.params.imovel_id]);
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// HISTÓRICO — Cadastrar
// -------------------------------------------------------
app.post('/api/historico', async (req, res) => {
    const { data, laudo, exame_id, valor, atualizado_por, equipamento_id } = req.body;
    if (!data)
        return res.status(400).json({ ok: false, error: 'Data é obrigatória.' });
    try {
        const [result] = await pool.query(
            `INSERT INTO tbHistorico (data, laudo, exame_id, valor, atualizado_por, equipamento_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [data, laudo || null, exame_id || null, valor || null, atualizado_por || null, equipamento_id || null]
        );
        res.json({ ok: true, historico_id: result.insertId, message: 'Histórico cadastrado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// TIPOS DE IMÓVEL — Listar
// -------------------------------------------------------
app.get('/api/imovel-tipos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM tbImovelTipo');
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// TIPOS DE SERVIÇO — Listar
// -------------------------------------------------------
app.get('/api/servico-tipos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM tbServicoTipo');
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Vercel não usa app.listen()
module.exports = app;
