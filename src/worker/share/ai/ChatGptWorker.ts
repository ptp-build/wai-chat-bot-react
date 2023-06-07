import {SendBotMsgReq} from "../../../../lib/ptp/protobuf/PTPMsg";
import {Pdu} from "../../../../lib/ptp/protobuf/BaseMsg";
import {ENV} from "../../../env";
import {DoWebsocket} from "../do/DoWebsocket";

export class ChatGptWorker{
    private msgId?: number;
    private chatId?: string;
    constructor() {}
    async process(pdu:Pdu,authUserId:string){
        let { chatId, msgId,chatGpt,...other } = SendBotMsgReq.parseMsg(pdu);
        this.chatId = chatId
        this.msgId = msgId;
        console.log({chatId,msgId},chatGpt)
        if(!chatGpt){
            return
        }
        let { messages, apiKey,systemPrompt, ...modelConfig } = JSON.parse(chatGpt!);
        let customApiKey = true
        if(!apiKey){
            apiKey = ENV.OPENAI_API_KEY;
            customApiKey = false
        }
        const text = messages[messages.length - 1].content
        messages.unshift({
            role: 'system',
            content: systemPrompt,
        });
        messages.forEach((message: { date: undefined }) => {
            if (message.date !== undefined) {
                delete message.date;
            }
        });
        const body = JSON.stringify({
            ...modelConfig,
            messages,
            stream: true,
        });
        const pdu1 = new SendBotMsgReq({
            ...other,
            msgId,
            chatId,
            text,
            senderId:authUserId
        }).pack()
        console.log(body)
        if(!customApiKey){
            await new DoWebsocket().sendChatGptMsg(Buffer.from(pdu1.getPbData()),chatId)
        }
    }
}
