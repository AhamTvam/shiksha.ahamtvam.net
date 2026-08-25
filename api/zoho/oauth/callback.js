export default async function handler(req, res) {
    const { code, error, error_description } = req.query;

    if (error) {
        return res.status(400).send(`
            <h2>Zoho Authorization Failed</h2>
            <p>${error}</p>
            <p>${error_description || ""}</p>
        `);
    }

    if (!code) {
        return res.status(400).send(`
            <h2>Missing Authorization Code</h2>
        `);
    }

    try {
        const params = new URLSearchParams({
            code,
            client_id: process.env.ZOHO_CLIENT_ID,
            client_secret: process.env.ZOHO_CLIENT_SECRET,
            redirect_uri: "https://shiksha.ahamtvam.net/api/zoho/oauth/callback",
            grant_type: "authorization_code"
        });

        const response = await fetch(
            "https://accounts.zoho.in/oauth/v2/token",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: params.toString()
            }
        );

        const data = await response.json();

        if (!response.ok || data.error) {
            return res.status(500).send(`
                <h2>Zoho Token Exchange Failed</h2>
                <pre>${JSON.stringify(data, null, 2)}</pre>
            `);
        }

        return res.status(200).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Zoho Authorization Complete</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 800px;
                        margin: 60px auto;
                        padding: 20px;
                    }
                    .box {
                        padding: 20px;
                        border: 1px solid #ddd;
                        border-radius: 10px;
                    }
                    code {
                        word-break: break-all;
                    }
                </style>
            </head>
            <body>
                <div class="box">
                    <h2>Zoho Authorization Successful</h2>

                    <p>Your refresh token has been generated.</p>

                    <p><strong>Refresh Token:</strong></p>

                    <code>${data.refresh_token || "Not returned"}</code>

                    <p>
                        Copy this refresh token and store it in Vercel
                        as <strong>ZOHO_REFRESH_TOKEN</strong>.
                    </p>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        return res.status(500).send(`
            <h2>Server Error</h2>
            <pre>${error.message}</pre>
        `);
    }
}
