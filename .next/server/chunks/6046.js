"use strict";exports.id=6046,exports.ids=[6046],exports.modules={16046:(a,b,c)=>{c.r(b),c.d(b,{default:()=>d});class d{constructor(){this.name="echo",this.version="1.0.0"}async handleCommand(a,b,c){switch(a){case"/help":return this.getHelp();case"/echo":if(0===b.length)return"Usage: /echo <message> - Echo back your message";return`Echo: ${b.join(" ")}`;default:return`Unknown command: ${a}. Type /help for available commands.`}}getHelp(){return`**Echo Plugin v${this.version}**

Available commands:
• \`/echo <message>\` - Echo back your message
• \`/help\` - Show this help message

Example: \`/echo Hello World!\` → Echo: Hello World!`}async initialize(){console.log(`Echo plugin v${this.version} initialized`)}async cleanup(){console.log("Echo plugin cleaned up")}}}};