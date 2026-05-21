import { 
    AuthenticationCreds, 
    AuthenticationState, 
    SignalDataTypeMap, 
    initAuthCreds, 
    BufferJSON, 
    proto,
    SignalDataSet
} from '@whiskeysockets/baileys';
import { Collection } from 'mongodb';

/**
 * Adaptador de estado de autenticación para Baileys usando MongoDB.
 * Permite persistir la sesión de WhatsApp en la base de datos para despliegues en VPS/Docker.
 */
export const useMongoDBAuthState = async (
    collection: Collection<any>,
    sessionId: string = 'default'
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
    
    const writeData = async (data: any, id: string) => {
        const json = JSON.stringify(data, BufferJSON.replacer);
        await collection.updateOne(
            { _id: `${sessionId}-${id}` as any },
            { $set: { data: json } },
            { upsert: true }
        );
    };

    const readData = async (id: string) => {
        try {
            const result = await collection.findOne({ _id: `${sessionId}-${id}` as any });
            if (result && result.data) {
                return JSON.parse(result.data, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            return null;
        }
    };

    const removeData = async (id: string) => {
        await collection.deleteOne({ _id: `${sessionId}-${id}` as any });
    };

    // Leer credenciales iniciales
    let creds: AuthenticationCreds = await readData('creds');
    if (!creds) {
        creds = initAuthCreds();
        await writeData(creds, 'creds');
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [_: string]: SignalDataTypeMap[typeof type] } = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data: SignalDataSet) => {
                    const tasks: Promise<void>[] = [];
                    for (const category of Object.keys(data)) {
                        const type = category as keyof SignalDataSet;
                        const categoryData = data[type];
                        if (categoryData) {
                            for (const id of Object.keys(categoryData)) {
                                const value = categoryData[id];
                                const key = `${type}-${id}`;
                                tasks.push(value ? writeData(value, key) : removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: async () => {
            await writeData(creds, 'creds');
        },
    };
};
