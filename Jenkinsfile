pipeline{
    agent any

    stages{
        stage("BUILD"){
            steps{
                echo "========executing BUILD========"
                sh 'npm ci'
                sh 'npm run build'
                sh 'npm run package'
            }
            post{
                always{
                    echo "========always========"
                }
                success{
                    echo "========A executed successfully========"
                }
                failure{
                    echo "========A execution failed========"
                }
            }
        }
        stage("UPLOAD") {
            steps {
                withAWS(credentials: "jenkins-s3-publisher") {
                   s3Upload(path: "pick-up-stix/releases", workingDir: "package", includePathPattern: "**/*.zip", bucket: "turkeysunite-foundry-modules")
                }
            }
            post {
                always{
                    echo "========Publish to S3 Success========"
                }
                failure{
                    echo "========Failed to upload to S3"
                }
            }
        }
    }

    // post{
    //     always{
    //         echo "========always========"
    //     }
    //     success{
    //         echo "========pipeline executed successfully ========"
    //     }
    //     failure{
    //         echo "========pipeline execution failed========"
    //     }
    // }
}