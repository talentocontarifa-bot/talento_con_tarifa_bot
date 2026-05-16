const { execSync } = require('child_process');

console.log("🤖 Iniciando robot lector de noticias...");

try {
    // 1. Obtenemos la lista de issues desde GitHub
    const output = execSync('gh issue list --state open --json number,title,body', { encoding: 'utf-8' });
    const issues = JSON.parse(output);

    if (issues.length === 0) {
        console.log('📭 Bandeja limpia. No hay noticias pendientes.');
        process.exit(0);
    }

    // 2. Tomamos el primer issue (tu correo entrante)
    const issue = issues[0];
    console.log(`\n📥 Se detectó un nuevo Issue #${issue.number}`);
    console.log(`Título original: "${issue.title}"`);
    console.log(`Cuerpo original:\n"${issue.body}"\n`);

    // 3. Magia Negra (Regex) para extraer SOLO el link y tirar a la basura el resto
    const urlMatch = issue.body.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : null;

    if (url) {
        console.log('✅ URL purificada con éxito: >>>', url, '<<<');
        console.log('\n[Simulación] -> Mandando a Gemini...');
        console.log('[Simulación] -> Renderizando en Remotion...');
        console.log('[Simulación] -> Subiendo a Meta Business Suite...');
        
        // 4. Cerramos el issue para que no se vuelva a procesar mañana
        console.log(`\n🔒 Para cerrar el ciclo, aquí el robot ejecutaría: gh issue close ${issue.number}`);
    } else {
        console.log('❌ No se encontró ninguna URL. Se descarta este issue.');
    }
} catch (error) {
    console.error('Error:', error.message);
}
