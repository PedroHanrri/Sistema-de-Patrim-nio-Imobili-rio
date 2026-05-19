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
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 30000,
    queueLimit: 0
});

// -------------------------------------------------------
// Rota raiz
// -------------------------------------------------------
app.get('/', (req, res) => res.json({ ok: true, message: 'API online' }));

// -------------------------------------------------------
// Ping
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
// USUÁRIOS — Listar todos
// -------------------------------------------------------
app.get('/api/usuarios', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT usuario_id, nome, login, atualizado_em FROM seguranca.tbUsuarios ORDER BY usuario_id'
        );
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// USUÁRIOS — Buscar por ID
// -------------------------------------------------------
app.get('/api/usuarios/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT usuario_id, nome, login, atualizado_em FROM seguranca.tbUsuarios WHERE usuario_id = ?',
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
        res.json({ ok: true, data: rows[0] });
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
// USUÁRIOS — Atualizar
// -------------------------------------------------------
app.put('/api/usuarios/:id', async (req, res) => {
    const { nome, login, senha } = req.body;
    if (!nome || !login)
        return res.status(400).json({ ok: false, error: 'Nome e login são obrigatórios.' });
    try {
        if (senha) {
            await pool.query(
                'UPDATE seguranca.tbUsuarios SET nome=?, login=?, senha=? WHERE usuario_id=?',
                [nome, login, senha, req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE seguranca.tbUsuarios SET nome=?, login=? WHERE usuario_id=?',
                [nome, login, req.params.id]
            );
        }
        res.json({ ok: true, message: 'Usuário atualizado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// USUÁRIOS — Excluir
// -------------------------------------------------------
app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM seguranca.tbUsuarios WHERE usuario_id = ?', [req.params.id]);
        res.json({ ok: true, message: 'Usuário removido com sucesso!' });
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
                   u.nome AS proprietario, t.descricao AS tipo,
                   i.proprietario_id, i.imovel_tipo_id, i.atualizado_em
            FROM tbImovel i
            JOIN seguranca.tbUsuarios u ON u.usuario_id = i.proprietario_id
            JOIN tbImovelTipo t         ON t.imovel_tipo_id = i.imovel_tipo_id
            ORDER BY i.imovel_id
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
        if (!rows.length) return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
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
// SERVIÇOS — Listar todos
// -------------------------------------------------------
app.get('/api/servicos', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT s.servico_id, s.descricao, s.valor,
                   t.descricao AS tipo_nome, s.servico_tipo_id, s.atualizado_em
            FROM tbServicos s
            JOIN tbServicoTipo t ON t.servico_tipo_id = s.servico_tipo_id
            ORDER BY s.servico_id
        `);
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// SERVIÇOS — Buscar por ID
// -------------------------------------------------------
app.get('/api/servicos/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT s.*, t.descricao AS tipo_nome
            FROM tbServicos s
            JOIN tbServicoTipo t ON t.servico_tipo_id = s.servico_tipo_id
            WHERE s.servico_id = ?
        `, [req.params.id]);
        if (!rows.length) return res.status(404).json({ ok: false, error: 'Serviço não encontrado.' });
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// SERVIÇOS — Cadastrar
// -------------------------------------------------------
app.post('/api/servicos', async (req, res) => {
    const { descricao, valor, servico_tipo_id, atualizado_por } = req.body;
    if (!descricao || !valor || !servico_tipo_id)
        return res.status(400).json({ ok: false, error: 'Campos obrigatórios faltando.' });
    try {
        const [result] = await pool.query(
            `INSERT INTO tbServicos (descricao, valor, servico_tipo_id, atualizado_por)
             VALUES (?, ?, ?, ?)`,
            [descricao, valor, servico_tipo_id, atualizado_por || null]
        );
        res.json({ ok: true, servico_id: result.insertId, message: 'Serviço cadastrado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// SERVIÇOS — Atualizar
// -------------------------------------------------------
app.put('/api/servicos/:id', async (req, res) => {
    const { descricao, valor, servico_tipo_id, atualizado_por } = req.body;
    if (!descricao || !valor || !servico_tipo_id)
        return res.status(400).json({ ok: false, error: 'Campos obrigatórios faltando.' });
    try {
        await pool.query(
            `UPDATE tbServicos SET descricao=?, valor=?, servico_tipo_id=?, atualizado_por=?
             WHERE servico_id=?`,
            [descricao, valor, servico_tipo_id, atualizado_por || null, req.params.id]
        );
        res.json({ ok: true, message: 'Serviço atualizado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------
// SERVIÇOS — Deletar
// -------------------------------------------------------
app.delete('/api/servicos/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM tbServicos WHERE servico_id = ?', [req.params.id]);
        res.json({ ok: true, message: 'Serviço removido com sucesso!' });
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

module.exports = app;
