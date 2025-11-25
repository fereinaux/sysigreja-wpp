# Troubleshooting - Erro 405 (Connection Failure)

## Problema

O erro **405 (Connection Failure)** ocorre quando o Baileys tenta conectar com o WhatsApp Web e a conexão é recusada imediatamente, antes mesmo de gerar o QR Code.

## Causas Identificadas (Baseado em Pesquisa)

### 1. **IP de Data Center Bloqueado** ⚠️ MAIS COMUM
- O WhatsApp bloqueia conexões provenientes de IPs de data centers/servidores em nuvem
- Serviços afetados: AWS, Azure, Google Cloud, Railway, Heroku, DigitalOcean, etc.
- O WhatsApp identifica esses IPs como não sendo de dispositivos residenciais

### 2. **Firewall/Proxy Bloqueando WebSocket**
- Firewalls corporativos ou proxies podem bloquear conexões WebSocket
- Conexões para `web.whatsapp.com` podem estar sendo bloqueadas
- Portas WebSocket (geralmente 443) podem estar bloqueadas

### 3. **ISP Bloqueando Conexões**
- Alguns ISPs bloqueiam conexões com WhatsApp Web
- Restrições de rede podem impedir a conexão

### 4. **Rate Limiting do WhatsApp**
- Muitas tentativas de conexão em pouco tempo
- WhatsApp pode temporariamente bloquear o IP

### 5. **VPN/Proxy Detectado**
- VPNs ou proxies podem ser detectados e bloqueados
- Proxies de data center são especialmente problemáticos

## Soluções

### ✅ Solução 1: Executar Localmente
**A mais simples e eficaz:**
- Execute o serviço na sua máquina local (não em servidor em nuvem)
- IPs residenciais geralmente não são bloqueados

### ✅ Solução 2: Usar IP Residencial ou Proxy Residencial
- Use um servidor com IP residencial
- Configure um proxy residencial (não de data center)
- Serviços como Bright Data, Oxylabs oferecem proxies residenciais

### ✅ Solução 3: Verificar Firewall/Proxy/VPN
- Desative temporariamente firewall, proxy ou VPN
- Verifique se as portas WebSocket estão abertas
- Teste de outra rede para confirmar

### ✅ Solução 4: Aguardar e Tentar Novamente
- Aguarde 5-10 minutos entre tentativas
- Evite múltiplas tentativas simultâneas
- Limpe o estado do Redis antes de tentar novamente

### ✅ Solução 5: Configurar Proxy no Baileys
Se você tiver um proxy residencial, pode configurá-lo:

```typescript
import { HttpsProxyAgent } from 'https-proxy-agent';

const socket = makeWASocket({
  // ... outras configurações
  fetchAgent: new HttpsProxyAgent('http://proxy-residencial:porta'),
});
```

## Verificações

### 1. Verificar se está em servidor em nuvem
```bash
# Verificar seu IP público
curl ifconfig.me

# Verificar se é IP de data center
# Use serviços como ipinfo.io para verificar o tipo de IP
```

### 2. Testar conexão WebSocket
```bash
# Testar se consegue conectar com WhatsApp Web
curl -I https://web.whatsapp.com
```

### 3. Verificar logs detalhados
Os logs agora mostram informações detalhadas sobre o erro 405.

## Informações da Issue #1939

A [Issue #1939](https://github.com/WhiskeySockets/Baileys/issues/1939) relata exatamente o mesmo problema:
- Erro 405 ocorre imediatamente ao tentar iniciar nova sessão
- WebSocket não consegue conectar com WhatsApp
- QR Code não é gerado
- Ocorre mesmo com `useMultiFileAuthState`

**Status da Issue:** Ainda aberta (sem solução oficial confirmada)

**Observações importantes:**
- O problema afeta usuários em diferentes ambientes
- Não há uma solução única confirmada pelos mantenedores
- A maioria das soluções envolve mudanças de ambiente/rede

## Tentativas de Solução Adicionais (Especialmente para Ambiente Local)

### Tentativa 1: Usar configuração de browser diferente
Alguns usuários relataram sucesso usando configurações específicas de browser. Teste estas opções:

**Opção A: Ubuntu Chrome**
```typescript
browser: ["Ubuntu", "Chrome", "22.04.4"],
```

**Opção B: macOS Desktop**
```typescript
import { Browsers } from '@whiskeysockets/baileys';

browser: Browsers.macOS('Desktop'),
```

**Opção C: Windows Desktop**
```typescript
import { Browsers } from '@whiskeysockets/baileys';

browser: Browsers.windows('Desktop'),
```

### Tentativa 2: Verificar Windows Defender / Antivírus
Mesmo em ambiente local, o Windows Defender ou antivírus pode estar bloqueando conexões WebSocket:
- Adicione exceção no Windows Defender para Node.js
- Verifique se o antivírus não está bloqueando conexões de saída
- Teste temporariamente desativando o firewall do Windows

### Tentativa 3: Verificar ISP / Provedor de Internet
Alguns ISPs bloqueiam conexões com WhatsApp Web mesmo em IPs residenciais:
- Teste de outra rede (ex: hotspot do celular)
- Verifique se consegue acessar web.whatsapp.com no navegador
- Teste com VPN (pode ajudar ou piorar, dependendo do caso)

### Tentativa 4: Limpar completamente o estado
Limpe TODAS as chaves relacionadas no Redis:
```bash
# Limpar todas as chaves do WhatsApp
redis-cli KEYS "whatsapp:*" | xargs redis-cli DEL
```

### Tentativa 5: Verificar se há múltiplas instâncias
Certifique-se de que não há múltiplas instâncias do serviço rodando:
```bash
# Windows
tasklist | findstr node

# Linux/Mac
ps aux | grep node
```

### Tentativa 6: Testar com logger mais verboso
Ative logs mais detalhados para ver exatamente onde está falhando:
```typescript
logger: pino({ level: "debug" }), // Em vez de "warn"
```

### Tentativa 7: Verificar versão do Node.js
Certifique-se de estar usando Node.js 18+:
```bash
node --version
```

### Tentativa 8: Testar conexão WebSocket manualmente
Verifique se consegue estabelecer conexão WebSocket com WhatsApp:
```bash
# Testar se consegue acessar WhatsApp Web
curl -v https://web.whatsapp.com
```

### Tentativa 9: Verificar se o IP está realmente residencial
Mesmo em ambiente local, verifique seu IP público:
```bash
curl ifconfig.me
# Depois verifique em https://ipinfo.io/{seu-ip}
# Veja se é classificado como "hosting" ou "datacenter"
```

### Tentativa 10: Testar diferentes configurações de browser automaticamente
Use o script de teste incluído no projeto para testar várias configurações:

```bash
npm run test:browsers
```

Este script testa automaticamente:
- Custom (atual)
- Ubuntu Chrome
- macOS Desktop
- Windows Desktop
- Ubuntu Desktop

Ele mostrará qual configuração consegue gerar QR Code ou estabelecer conexão.

### Tentativa 2: Limpar estado de autenticação
Se você já tentou conectar antes e falhou, limpe o estado:

```bash
# Limpar todas as chaves do Redis relacionadas à sessão
redis-cli KEYS "whatsapp:auth:*" | xargs redis-cli DEL
redis-cli KEYS "whatsapp:qr:*" | xargs redis-cli DEL
redis-cli KEYS "whatsapp:status:*" | xargs redis-cli DEL
```

### Tentativa 3: Verificar versão do Baileys
Certifique-se de estar usando a versão mais recente:

```bash
npm install @whiskeysockets/baileys@latest
```

## Referências

- [GitHub Issue #1939 - 405 Method Not Allowed error](https://github.com/WhiskeySockets/Baileys/issues/1939) - Issue específica mencionada
- [GitHub Issue #999 - Error 405](https://github.com/WhiskeySockets/Baileys/issues/999)
- [GitHub Issue #1427 - 405 Method Not Allowed](https://github.com/WhiskeySockets/Baileys/issues/1427)
- [GitHub Issue #1476 - 405 disconnect code](https://github.com/WhiskeySockets/Baileys/issues/1476)
- [Railway - WebSocket Blocking](https://station.railway.com/questions/railway-blocks-websockets)

## Conclusão

O erro 405 é **principalmente causado por bloqueio de IPs de data centers pelo WhatsApp**. A solução mais eficaz é executar o serviço em um ambiente com IP residencial ou usar um proxy residencial.

