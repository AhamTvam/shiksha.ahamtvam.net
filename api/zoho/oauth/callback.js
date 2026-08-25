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
            redirect_uri:
                "https://shiksha.ahamtvam.net/api/zoho/oauth/callback",
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
                <h2>Zoho Authorization Failed</h2>
                <p>Token exchange was unsuccessful.</p>
            `);
        }

        return res.status(200).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Zoho Payments Connected</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background: #f7f7f7;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                    }

                    .box {
                        background: white;
                        padding: 40px;
                        border-radius: 12px;
                        max-width: 500px;
                        text-align: center;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                    }

                    h2 {
                        color: #111;
                    }

                    p {
                        color: #555;
                        line-height: 1.6;
                    }
                </style>
            </head>

            <body>
                <div class="box">
                    <h2>Zoho Payments Connected</h2>
                    <p>
                        Your Zoho Payments authorization has been completed successfully.
                    </p>
                    <p>
                        You can safely close this window.
                    </p>
                </div>
            </body>
            </html>
        `);

    } catch (err) {
        console.error("Zoho OAuth error:", err);

        return res.status(500).send(`
            <h2>Server Error</h2>
            <p>Unable to complete Zoho authorization.</p>
        `);
    }
}
