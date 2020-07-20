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
                    s3Upload(bucket:"turkeysunite-foundry-modules", path:"pick-up-stix/releases/", includePathPattern:'**/*.zip', workingDir:"package", excludePathPattern:"**/*.svg,**/*.jpg", acl: "PublicRead")
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