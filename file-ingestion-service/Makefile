.PHONY: deploy deploy-full configure-cors help

help:
	@echo "Available commands:"
	@echo "  make deploy        - Deploy serverless service only"
	@echo "  make deploy-full   - Deploy service + configure S3 CORS"
	@echo "  make configure-cors - Configure S3 CORS only"

deploy:
	serverless deploy

deploy-full: deploy configure-cors
	@echo "✅ Deployment complete with S3 CORS configuration"

configure-cors:
	@echo "Configuring S3 bucket CORS..."
	./scripts/configure-s3-cors.sh

