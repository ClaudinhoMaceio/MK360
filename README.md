# MK 360 - Execucao Segura (HTML/CSS/JavaScript)

Este projeto agora inclui um servidor local em JavaScript (`server.js`) com cabecalhos de isolamento para recursos de video.

## 1) Requisitos

- Node.js instalado

## 2) Como iniciar

No terminal, dentro da pasta do projeto:

```powershell
node server.js
```

Sera exibido:

- `http://localhost:8080` (sempre)
- `https://localhost:8443` (somente se houver certificado em `certs/`)

## 3) Certificado HTTPS (opcional, recomendado)

Crie a pasta `certs` e adicione:

- `certs/localhost-key.pem`
- `certs/localhost.pem`

Voce pode gerar com `mkcert`:

```powershell
mkcert -install
mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 ::1
```

## 4) Cabecalhos aplicados automaticamente

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- `Cross-Origin-Resource-Policy: cross-origin`

## 5) Observacao importante

Mesmo sem HTTPS, `http://localhost` costuma funcionar como contexto seguro em desenvolvimento.
Para ambiente de producao, use HTTPS real.
