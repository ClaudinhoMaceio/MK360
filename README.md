# MK 360 - Execucao Segura (HTML/CSS/JavaScript)

Este projeto agora inclui um servidor local em JavaScript (`server.js`) com cabecalhos de isolamento para recursos de video.

## 1) Requisitos

- Node.js instalado

## 2) Instalar e iniciar (Node.js)

No terminal, dentro da pasta do projeto:

```powershell
npm install
npm start
```

Sera exibido:

- `http://localhost:8080` (sempre)
- `https://localhost:8443` (somente se houver certificado em `certs/`)

## 3) Configuracoes separadas

As configuracoes foram separadas em:

- `config/app-config.js` -> configuracoes gerais do servidor (host, portas, TLS, origem publica e pasta de uploads)
- `config/video-config.js` -> configuracoes de video e upload (limites de tamanho e MIME types)
- Na tela de configuracoes do app, use o botao `Ver pasta de videos` para ver o caminho exato onde os ficheiros estao sendo salvos no Node.

## 4) Usar no celular (mobile)

1. Conecte PC e celular na mesma rede Wi-Fi.
2. Inicie o projeto com `npm start`.
3. No terminal, use o endereco `HTTP Rede` exibido (ex.: `http://192.168.0.10:8080`).
4. Abra esse endereco no navegador do celular.
5. Se nao abrir, libere a porta `8080` no firewall do Windows.

### GitHub Pages (MK360 publicado)

No site [`https://claudinhomaceio.github.io/MK360/`](https://claudinhomaceio.github.io/MK360/) o app agora aplica padrao automatico:

- define o modo de partilha como `drive`
- evita consultar `/api/server-info` automaticamente quando nao houver backend Node configurado

Assim, o QR tende a usar o link do Google Drive sem depender de endpoint `/api/upload` no GitHub Pages.

### Limitação técnica no GitHub Pages

Em `github.io`, o browser normalmente nao ativa `SharedArrayBuffer` (sem COOP/COEP), entao:

- o FFmpeg pode nao converter para MP4;
- o app entra em modo compativel e segue com ficheiro `WEBM` para manter o QR e a partilha.

## 5) Certificado HTTPS (opcional, recomendado)

Crie a pasta `certs` e adicione:

- `certs/localhost-key.pem`
- `certs/localhost.pem`

Voce pode gerar com `mkcert`:

```powershell
mkcert -install
mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 ::1
```

## 6) Cabecalhos aplicados automaticamente

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- `Cross-Origin-Resource-Policy: cross-origin`

## 7) Observacao importante

Mesmo sem HTTPS, `http://localhost` costuma funcionar como contexto seguro em desenvolvimento.
Para ambiente de producao, use HTTPS real.
